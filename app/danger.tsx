import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, Button, Notice, P, H1 } from '../src/components/ui';
import { PinPad } from '../src/components/PinPad';
import { startAlarm } from '../src/lib/dangerAlarm';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { encryptAndUpload, persistDekAfterFinalize, registerMyPublicKey, buildEnvelopesForContacts } from '../src/lib/recordingUpload';
import { errorNl } from '../src/lib/convex';
import { palette } from '../src/lib/theme';

/**
 * Gevaarmodus: alarm + optionele strobe tot server-PIN.
 * Auto-opname alleen na mic-consent; kan alarmgeluid meenemen (beperking).
 * Locatie-pings voeden de tracking-link; zonder updater/consent geen “live”-claim.
 */
export default function Danger() {
  const { incidentId, sharePath } = useLocalSearchParams<{ incidentId?: string; sharePath?: string }>();
  const pinStatus = useQuery(api.security.pinStatus);
  const active = useQuery(api.incidents.active);
  const verify = useMutation(api.security.verifyPin);
  const me = useQuery(api.profiles.me);
  const contactKeys = useQuery(api.deviceCrypto.contactPublicKeys) ?? [];
  const ping = useMutation(api.incidents.pingLocation);
  const genUrl = useMutation(api.recordings.generateUploadUrl);
  const finalize = useMutation(api.recordings.finalize);
  const putEnvelopes = useMutation(api.recordings.putEnvelopes);
  const registerKey = useMutation(api.deviceCrypto.registerPublicKey);
  const [perm, requestPerm] = useCameraPermissions();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [torch, setTorch] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [recActive, setRecActive] = useState(false);
  const [recNote, setRecNote] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);
  const alarm = useRef<{ stop: () => Promise<void> } | null>(null);
  const startedRec = useRef(false);
  const strobeOn = !!(active?.torchRequested && pinStatus?.torchStrobeOptIn && Platform.OS !== 'web');
  const iid = (incidentId || active?._id) as Id<'incidents'> | undefined;

  useEffect(() => {
    let alive = true;
    (async () => {
      alarm.current = await startAlarm();
      if (!alive) await alarm.current.stop();
    })();
    return () => { alive = false; alarm.current?.stop(); };
  }, []);

  // Strobe ~2 Hz
  useEffect(() => {
    if (!strobeOn) return;
    if (!perm?.granted) { requestPerm(); return; }
    const id = setInterval(() => setTorch((t) => !t), 500);
    return () => { clearInterval(id); setTorch(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strobeOn, perm?.granted]);

  // Consented mic recording once per danger session
  useEffect(() => {
    if (!iid || startedRec.current) return;
    startedRec.current = true;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setRecNote('Opname op web: geef microfoon-toestemming in de browserprompt, of sla over.');
          return;
        }
        const permR = await requestRecordingPermissionsAsync();
        if (!permR.granted) {
          setRecNote('Microfoon geweigerd — geen opname. Alarm/locatie gaan door.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecActive(true);
        setRecNote('OPNAME ACTIEF — alarmgeluid kan meegenomen worden in de audio.');
      } catch {
        setRecNote('Opname starten mislukt (toestemming/module).');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iid]);

  // Location pings while incident active + consent
  useEffect(() => {
    if (!iid) return;
    let cancelled = false;
    const tick = async () => {
      const loc = await getConsentedLocation();
      if (cancelled || !loc.locationConsent) return;
      try {
        await ping({
          incidentId: iid,
          lat: loc.lat, lng: loc.lng, accuracyM: loc.accuracyM,
          recordedAt: loc.locationAt, locationConsent: true,
        });
      } catch { /* offline: tracking veroudert eerlijk */ }
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [iid, ping]);

  const stopRecordingUpload = async () => {
    if (!recActive || !iid) return;
    try {
      await recorder.stop();
      setRecActive(false);
      const uri = recorder.uri;
      if (!uri || !me?.userId) return;
      const res = await fetch(uri);
      const blob = await res.blob();
      const mime = blob.type || 'audio/m4a';
      await registerMyPublicKey(registerKey);
      const uploadUrl = await genUrl({});
      const up = await encryptAndUpload({ blob, mime, userId: me.userId, uploadUrl, preferE2e: true });
      const fin = await finalize({
        storageId: up.storageId as Id<'_storage'>,
        mime: up.mimeStored, byteSize: up.byteSize, plaintextByteSize: up.plaintextByteSize,
        durationMs: Math.round((recorder.currentTime || 0) * 1000),
        incidentId: iid, encryption: up.encryption, clientUploadId: up.clientUploadId,
      });
      if (up.dek && up.encryption === 'e2e-v1') {
        await persistDekAfterFinalize(fin.id, up.dek);
        if (contactKeys.length) {
          const envs = await buildEnvelopesForContacts(up.dek, contactKeys);
          await putEnvelopes({ recordingId: fin.id, envelopes: envs.map((e) => ({ ...e, recipientId: e.recipientId as Id<'users'> })) });
        }
        up.dek.fill(0);
      }
      setRecNote(up.note + ' (alarmgeluid kan in plaintext gezeten hebben vóór encryptie.)');
    } catch (e) {
      setRecNote('Upload mislukt: ' + errorNl(e));
    }
  };

  const unlock = async (pin: string) => {
    setBusy(true); setErr(null); setOfflineHint(false);
    try {
      await stopRecordingUpload();
      const loc = await getConsentedLocation();
      const res = await verify({
        pin,
        purpose: 'unlock_danger',
        incidentId: iid,
        ...loc,
      });
      if (!res.ok) {
        setErr('Onjuiste code. Probeer opnieuw.');
        return;
      }
      await alarm.current?.stop();
      setTorch(false);
      router.replace('/dashboard');
    } catch (e) {
      const msg = errorNl(e);
      if (msg === 'RATE_LIMITED') setErr('Te veel pogingen. Wacht even.');
      else if (/network|fetch|Failed|offline|NOT_AUTHENTICATED/i.test(String(e)) || msg.includes('netwerk')) {
        setOfflineHint(true);
        setErr('Geen verbinding met de server. Alarm stopt pas na geslaagde PIN-verificatie online — we beweren geen offline-unlock.');
      } else {
        setErr('Onjuiste code. Probeer opnieuw.');
      }
    } finally { setBusy(false); }
  };

  const shareTrack = async () => {
    if (!sharePath) return;
    const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
    const text = `SafeWalk-locatielink (tijdelijk): ${site}${sharePath}\nSafeWalk belt niet 112.`;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(text);
      else await Share.share({ message: text });
    } catch { /* ignore */ }
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, backgroundColor: '#1a0505', margin: -20, padding: 20, gap: 14 }}>
        <H1>GEVAARMODUS ACTIEF</H1>
        <Notice kind="danger">Alarm speelt tot je het stopt met je veiligheids-PIN (server-check). SafeWalk belt 112 niet automatisch.</Notice>
        {recActive && <Notice kind="danger">🔴 OPNAME BEZIG — alarmgeluid kan in de opname zitten.</Notice>}
        {recNote && <Notice kind="info">{recNote}</Notice>}
        {sharePath && (
          <Notice kind="info">Tracking-link aangemaakt (intrekbaar/TTL). “Live” alleen met actieve locatie-updater + verse pings.</Notice>
        )}
        {offlineHint && (
          <Notice kind="warn">Offline/PIN-server onbereikbaar: geen veiligheidsclaim. Probeer opnieuw als je online bent.</Notice>
        )}
        <P muted style={{ color: '#fecaca' }}>Contacten zijn (indien aanwezig) per in-app push gewaarschuwd. Zaklamp-strobe alleen met camera/flash + opt-in.</P>
        {strobeOn && perm?.granted && (
          <View style={{ height: 1, overflow: 'hidden', opacity: 0.01 }} pointerEvents="none" accessibilityElementsHidden>
            <CameraView facing="back" enableTorch={torch} style={{ width: 1, height: 1 }} />
          </View>
        )}
        {strobeOn && !perm?.granted && (
          <Notice kind="warn">Zaklamp-toestemming nodig voor strobe. Zonder toestemming blijft alleen het alarm actief.</Notice>
        )}
        {!strobeOn && (
          <Notice kind="info">Zaklamp-strobe staat uit (geen opt-in, web, of geen flash). Alarm blijft wel actief.</Notice>
        )}
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ color: palette.red, fontSize: 48, fontWeight: '900' }}>🚨</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 }}>Alarm actief</Text>
        </View>
        {!showPin ? (
          <>
            <Button title="Stop met veiligheids-PIN" onPress={() => setShowPin(true)} />
            {sharePath ? <Button title="Deel tracking-link (jij bevestigt Send)" variant="secondary" onPress={shareTrack} /> : null}
            <Button title="📞 Bel zelf 112" variant="danger" hint="Opent de telefoon-app; SafeWalk belt niet" onPress={() => Linking.openURL('tel:112')} />
          </>
        ) : (
          <PinPad
            title="Voer veiligheids-PIN in"
            hint="Alleen de juiste PIN (server) stopt het alarm. Bij een foute code zie je een gewone foutmelding."
            length={6}
            error={err}
            busy={busy}
            onSubmit={unlock}
            onCancel={() => { setShowPin(false); setErr(null); }}
          />
        )}
        {err && !showPin && <Notice kind="danger">{err}</Notice>}
      </View>
    </Screen>
  );
}
