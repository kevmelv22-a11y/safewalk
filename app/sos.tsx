import { useEffect, useRef, useState } from 'react';
import { Text, View, Vibration } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, Button, Notice, P, H1 } from '../src/components/ui';
import { DeliveryList } from '../src/components/DeliveryList';
import { triggerSos, sosQueue } from '../src/lib/sos';
import { COPY as DialCopy, onPressOpen112 } from '../src/lib/dial112';
import { useProfile } from '../src/lib/queries';
import { useTheme } from '../src/lib/theme';

type Phase = 'countdown' | 'sending' | 'sent' | 'queued' | 'cancelled' | 'error';

export default function Sos() {
  const t = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const profile = useProfile();
  const cancelAlert = useMutation(api.sos.cancel);
  const [left, setLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [alertId, setAlertId] = useState<Id<'alerts'> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fired = useRef(false); const clientRef = useRef<string | null>(null);
  const alert = useQuery(api.sos.get, alertId ? { alertId } : 'skip');

  const fire = async () => {
    if (fired.current) return; fired.current = true; setPhase('sending');
    try {
      const r = await triggerSos((sessionId as Id<'sessions'>) ?? null);
      clientRef.current = r.clientRef;
      if (r.alertId) { setAlertId(r.alertId); setPhase('sent'); } else setPhase('queued');
    } catch (e) { setErr(String((e as Error).message)); setPhase('error'); }
  };
  // Aftelling start ook als het profiel (offline) niet laadt: standaard 5 s
  useEffect(() => { if (left === null) { const t = setTimeout(() => setLeft((l) => l ?? 5), 1500); return () => clearTimeout(t); } }, [left]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig de aftelduur uit het (later geladen) profiel overnemen
  useEffect(() => { if (left === null && profile) setLeft(profile.sosCountdownSeconds); }, [profile, left]);
  useEffect(() => {
    if (phase !== 'countdown' || left === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- teller op 0: SOS versturen
    if (left <= 0) { fire(); return; }
    Vibration.vibrate(150);
    const tm = setTimeout(() => setLeft((l) => (l ?? 1) - 1), 1000);
    return () => clearTimeout(tm);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire is idempotent (fired-ref); alleen op tik van de teller reageren
  }, [left, phase]);

  const cancelAfter = async () => {
    if (alertId) await cancelAlert({ alertId }).catch(() => {});
    if (clientRef.current) await sosQueue.remove(clientRef.current);
    setPhase('cancelled');
  };

  return (
    <Screen>
      {phase === 'countdown' && (
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 30 }}>
          <H1>SOS wordt verstuurd over</H1>
          <Text accessibilityLiveRegion="assertive" style={{ fontSize: 120, fontWeight: '900', color: t.red }}>{left ?? '…'}</Text>
          <P muted>Je vertrouwde contacten krijgen een pushmelding met je laatst bekende locatie.</P>
          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <Button title="ANNULEREN" variant="secondary" onPress={() => { setPhase('cancelled'); router.back(); }} />
            <Button title="Nu versturen" variant="danger" onPress={() => setLeft(0)} />
          </View>
        </View>
      )}
      {phase === 'sending' && <H1>Versturen…</H1>}
      {phase === 'sent' && (<>
        <H1>SOS geregistreerd</H1>
        <Notice kind="info">Hieronder zie je per contact of het bericht aan de pushdienst is overgedragen. Aflevering op hun telefoon is niet gegarandeerd. Bel ze eventueel ook zelf.</Notice>
        <DeliveryList deliveries={alert?.deliveries ?? []} />
      </>)}
      {phase === 'queued' && <Notice kind="danger">Geen verbinding: je SOS is opgeslagen en wordt automatisch opnieuw verstuurd zodra er internet is. Er is nog NIEMAND gewaarschuwd. Bel bij direct gevaar zelf 112.</Notice>}
      {phase === 'error' && <Notice kind="danger">Versturen mislukt: {err}. Bel bij direct gevaar zelf 112.</Notice>}
      {phase === 'cancelled' && <Notice kind="ok">SOS geannuleerd.</Notice>}
      {phase !== 'countdown' && (<>
        <Button title={DialCopy.title} variant="danger" hint={DialCopy.hint} onPress={() => { void onPressOpen112(); }} />
        <P muted>{DialCopy.hint}. Het nummer 112 staat klaar; jij drukt op bellen.</P>
        {(phase === 'sent' || phase === 'queued') && <Button title="Vals alarm – ik ben veilig" variant="secondary" onPress={cancelAfter} />}
        <Button title="Terug naar dashboard" variant="secondary" onPress={() => router.replace('/dashboard')} />
      </>)}
    </Screen>
  );
}
