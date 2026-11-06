import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, Button, Notice, P, H1 } from '../src/components/ui';
import { PinPad } from '../src/components/PinPad';
import { startAlarm } from '../src/lib/dangerAlarm';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { errorNl } from '../src/lib/convex';
import { palette } from '../src/lib/theme';

/** Gevaarmodus: hoorbaar alarm + optionele zaklamp-strobe tot server-geverifieerde PIN. */
export default function Danger() {
  const { incidentId } = useLocalSearchParams<{ incidentId?: string }>();
  const pinStatus = useQuery(api.security.pinStatus);
  const active = useQuery(api.incidents.active);
  const verify = useMutation(api.security.verifyPin);
  const [perm, requestPerm] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const alarm = useRef<{ stop: () => Promise<void> } | null>(null);
  const strobeOn = !!(active?.torchRequested && pinStatus?.torchStrobeOptIn && Platform.OS !== 'web');

  useEffect(() => {
    let alive = true;
    (async () => {
      alarm.current = await startAlarm();
      if (!alive) await alarm.current.stop();
    })();
    return () => { alive = false; alarm.current?.stop(); };
  }, []);

  // Strobe ~2 Hz (veilige default; fotosensitiviteit: alleen na opt-in)
  useEffect(() => {
    if (!strobeOn) return;
    if (!perm?.granted) { requestPerm(); return; }
    const id = setInterval(() => setTorch((t) => !t), 500);
    return () => { clearInterval(id); setTorch(false); };
  }, [strobeOn, perm?.granted]);

  const unlock = async (pin: string) => {
    setBusy(true); setErr(null);
    try {
      const loc = await getConsentedLocation();
      const res = await verify({
        pin,
        purpose: 'unlock_danger',
        incidentId: (incidentId || active?._id) as Id<'incidents'> | undefined,
        ...loc,
      });
      if (!res.ok) {
        // Generieke fout — stil alarm is server-side al verstuurd
        setErr('Onjuiste code. Probeer opnieuw.');
        return;
      }
      await alarm.current?.stop();
      setTorch(false);
      router.replace('/dashboard');
    } catch (e) {
      setErr(errorNl(e) === 'RATE_LIMITED' ? 'Te veel pogingen. Wacht even.' : 'Onjuiste code. Probeer opnieuw.');
    } finally { setBusy(false); }
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, backgroundColor: '#1a0505', margin: -20, padding: 20, gap: 14 }}>
        <H1>GEVAARMODUS ACTIEF</H1>
        <Notice kind="danger">Alarm speelt tot je het stopt met je veiligheids-PIN. SafeWalk belt 112 niet automatisch.</Notice>
        <P muted style={{ color: '#fecaca' }}>Contacten zijn (indien aanwezig) per in-app push gewaarschuwd. Zaklamp-strobe werkt alleen op een apparaat met camera/flash en na jouw opt-in.</P>
        {strobeOn && perm?.granted && (
          <View style={{ height: 1, overflow: 'hidden', opacity: 0.01 }} pointerEvents="none" accessibilityElementsHidden>
            {/* Verborgen CameraView alleen om enableTorch te kunnen schakelen */}
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
            <Button title="📞 Bel zelf 112" variant="danger" hint="Opent de telefoon-app; SafeWalk belt niet" onPress={() => Linking.openURL('tel:112')} />
          </>
        ) : (
          <PinPad
            title="Voer veiligheids-PIN in"
            hint="Alleen de juiste PIN stopt het alarm. Bij een foute code zie je een gewone foutmelding."
            length={6}
            error={err}
            busy={busy}
            onSubmit={unlock}
            onCancel={() => { setShowPin(false); setErr(null); }}
          />
        )}
      </View>
    </Screen>
  );
}
