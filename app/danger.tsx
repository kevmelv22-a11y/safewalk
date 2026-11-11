import { useEffect, useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { applyAudioMode } from '../src/lib/audioMode';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, Button, Notice, P, H1 } from '../src/components/ui';
import { PinPad } from '../src/components/PinPad';
import { startAlarm } from '../src/lib/dangerAlarm';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { uploadEncryptedRecording } from '../src/lib/recordingUpload';
import { runDangerUnlock } from '../src/lib/dangerUnlock';
import { ContactComposer } from '../src/components/ContactComposer';
import { locationMessage } from '../src/lib/composer';
import { getBackgroundRecordingOptIn } from '../src/lib/recordingPrefs';
import { deleteLocalOriginal } from '../src/lib/playbackFile';
import { useAuthToken } from '@convex-dev/auth/react';
import { errorNl } from '../src/lib/convex';
import { COPY as DialCopy, onPressOpen112 } from '../src/lib/dial112';
import { useTheme } from '../src/lib/theme';
import { CRITICAL_ACTIONS } from '../src/lib/themeCatalog';

/**
 * Gevaarmodus: alarm + optionele strobe tot server-PIN.
 * Auto-opname alleen na mic-consent; kan alarmgeluid meenemen (beperking).
 * Locatie-pings voeden de tracking-link; zonder updater/consent geen “live”-claim.
 */
export default function Danger() {
  const t = useTheme();
  const { incidentId, sharePath } = useLocalSearchParams<{ incidentId?: string; sharePath?: string }>();
  const pinStatus = useQuery(api.security.pinStatus);
  const active = useQuery(api.incidents.active);
  const verify = useMutation(api.security.verifyPin);
  const me = useQuery(api.profiles.me);
  const contactKeys = useQuery(api.deviceCrypto.contactPublicKeys) ?? [];
  const ping = useMutation(api.incidents.pingLocation);
  const authToken = useAuthToken();
  const putEnvelopes = useMutation(api.recordings.putEnvelopes);
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
        const bg = await getBackgroundRecordingOptIn();
        await applyAudioMode({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: bg });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecActive(true);
        setRecNote(bg
          ? 'OPNAME ACTIEF — loopt door op de achtergrond (jouw keuze; systeemmelding zichtbaar). Het OS kan opname alsnog onderbreken.'
          : 'OPNAME ACTIEF — stopt als de app naar de achtergrond gaat (achtergrond-opname staat uit).');
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

  /** Stops the recorder locally and returns the (deferred) encrypted upload; never called before PIN verification. */
  const stopRecorder = async (): Promise<(() => Promise<void>) | null> => {
    if (!recActive || !iid) return null;
    await recorder.stop();
    setRecActive(false);
    const uri = recorder.uri;
    const durationMs = Math.round((recorder.currentTime || 0) * 1000);
    if (!uri || !me?.userId) return null;
    const userId = me.userId; const token = authToken; const contacts = contactKeys; const incident = iid;
    return async () => {
      const res = await fetch(uri);
      const blob = await res.blob();
      const mime = blob.type || 'audio/m4a';
      const up = await uploadEncryptedRecording({
        blob, mime, userId, authToken: token, contacts, putEnvelopes: putEnvelopes as never, durationMs, incidentId: incident,
      });
      deleteLocalOriginal(uri);
      setRecNote(up.note);
    };
  };

  const unlock = async (pin: string) => {
    setBusy(true); setErr(null); setOfflineHint(false);
    try {
      const outcome = await runDangerUnlock({
        verify: async () => {
          const loc = await getConsentedLocation();
          return verify({ pin, purpose: 'unlock_danger', incidentId: iid, ...loc });
        },
        stopRecorder,
        stopAlarm: async () => { await alarm.current?.stop(); setTorch(false); },
        classifyError: (e) => {
          const msg = errorNl(e);
          if (/RATE_LIMITED/.test(String(e)) || msg.includes('Te veel')) return 'rate_limited';
          if (/network|fetch|Failed|offline|NOT_AUTHENTICATED/i.test(String(e)) || msg.includes('netwerk')) return 'offline';
          return 'error';
        },
        onUploadError: (e) => setRecNote('Upload mislukt: ' + errorNl(e)),
      });
      if (outcome === 'ok') { router.replace('/dashboard'); return; }
      if (outcome === 'rate_limited') setErr('Te veel pogingen. Wacht even.');
      else if (outcome === 'offline') {
        setOfflineHint(true);
        setErr('Geen verbinding met de server. Alarm en opname lopen door tot de code online is gecontroleerd.');
      } else setErr('Onjuiste code. Probeer opnieuw.');
    } finally { setBusy(false); }
  };

  const trackMessage = (() => {
    const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
    try { return sharePath ? locationMessage(`${site}${sharePath}`) : null; } catch { return null; }
  })();

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
    <Screen ambient={false} backgroundColor="#1a0505">
      <View style={{ flex: 1, backgroundColor: '#1a0505', margin: -20, padding: 20, gap: 14, borderTopWidth: 3, borderTopColor: CRITICAL_ACTIONS.red }}>
        <H1>GEVAARMODUS ACTIEF</H1>
        <Notice kind="danger">Alarm speelt tot je het stopt met je veiligheidscode (server-check). SafeWalk belt 112 niet automatisch.</Notice>
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
          <Text style={{ color: t.red, fontSize: 48, fontWeight: '900' }}>🚨</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 }}>Alarm actief</Text>
        </View>
        {!showPin ? (
          <>
            <Button title="Stop met veiligheidscode" onPress={() => setShowPin(true)} />
            {sharePath ? <Button title="Deel tracking-link (jij bevestigt Send)" variant="secondary" onPress={shareTrack} /> : null}
            {sharePath && trackMessage ? <ContactComposer message={trackMessage} /> : null}
            <Button title={DialCopy.title} variant="danger" hint={DialCopy.hint} onPress={() => { void onPressOpen112(); }} />
          </>
        ) : (
          <PinPad
            title="Voer je veiligheidscode in"
            hint="Alleen de juiste code (server) stopt het alarm. Hoofdletters tellen mee. Bij een foute code zie je een gewone foutmelding."
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
