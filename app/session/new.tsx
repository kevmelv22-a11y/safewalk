import { useState, useEffect } from 'react';
import { useNow } from '../../src/lib/useLiveLocations';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Button, Field, Notice, Card } from '../../src/components/ui';
import { useContacts } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { etaLabel, roughEtaMs, suggestMinutes, validateSessionInput } from '../../src/lib/safety';
import { useTripDraft } from '../../src/store/trip';
import * as Location from 'expo-location';
import { startSharing } from '../../src/lib/location';
import { localNotify, scheduleCheckInReminder } from '../../src/lib/notifications';

export default function NewSession() {
  const startSession = useMutation(api.sessions.start);
  const contacts = useContacts()?.mine ?? [];
  const [dest, setDest] = useState('Thuis'); const [minutes, setMinutes] = useState(20);
  const [sel, setSel] = useState<Id<'users'>[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const destination = useTripDraft((s) => s.destination); const setDestination = useTripDraft((s) => s.setDestination);
  const [eta, setEta] = useState<number | null>(null);
  const now = useNow(15_000);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- formulier volgt de gekozen bestemming
    if (!destination) return setEta(null);
    setDest(destination.label);
    Location.getLastKnownPositionAsync().then((l) => {
      if (!l) return; const e = roughEtaMs({ lat: l.coords.latitude, lng: l.coords.longitude }, destination);
      setEta(e); setMinutes(suggestMinutes(e));
    }).catch(() => {});
  }, [destination]);
  const toggle = (id: Id<'users'>) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const start = async () => {
    const arrival = new Date(Date.now() + minutes * 60_000);
    const v = validateSessionInput({ destination: dest, arrival, viewerIds: sel }); if (v) return setErr(v);
    setBusy(true); setErr(null);
    let id: Id<'sessions'>;
    try { id = await startSession({ destination: dest.trim(), destLat: destination?.lat, destLng: destination?.lng, expectedArrival: arrival.getTime(), viewerIds: sel }); setDestination(null); }
    catch (e) { setBusy(false); return setErr(errorNl(e)); }
    let shared = true;
    try { await startSharing(id); }
    catch { shared = false; } // reisscherm toont dan "niet gedeeld" + knop om te hervatten
    await scheduleCheckInReminder(arrival).catch(() => {});
    await localNotify('Reis gestart', shared
      ? 'Je locatie wordt gedeeld zolang SafeWalk open is, tot je aankomst bevestigt of stopt.'
      : 'Let op: je locatie wordt nog niet gedeeld (geen toestemming). De check-in loopt wel.').catch(() => {});
    setBusy(false);
    router.replace(`/session/${id}`);
  };
  return (
    <Screen>
      <H1>Reis starten</H1>
      <Field label="Bestemming" value={dest} onChangeText={setDest} />
      <Button title={destination ? `📍 ${destination.label} (wijzigen)` : '📍 Kies bestemming op kaart (optioneel)'} variant="secondary" onPress={() => router.push('/session/destination')} />
      {eta !== null && <P muted>Geschat: {etaLabel(eta)}. Kies zelf een ruime aankomsttijd.</P>}
      <P>Ik verwacht er te zijn over</P>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {[10, 20, 30, 45, 60, 90].map((m) => <View key={m} style={{ flexGrow: 1 }}><Button title={`${m} min`} variant={m === minutes ? 'primary' : 'secondary'} onPress={() => setMinutes(m)} /></View>)}
      </View>
      <P muted>Verwachte aankomst: {new Date(now + minutes * 60_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>
      <Card>
        <P>Wie mag meekijken tijdens deze reis?</P>
        {contacts.map((c) => <Button key={c.userId} title={`${sel.includes(c.userId) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.userId) ? 'success' : 'secondary'} onPress={() => toggle(c.userId)} />)}
        <P muted>Alleen deze personen zien je locatie, en alleen tot de reis eindigt.</P>
      </Card>
      <Notice kind="info">Je locatie wordt alleen gedeeld zolang SafeWalk open is. Als je de app sluit of je scherm vergrendelt, stopt het delen tijdelijk.</Notice>
      {err && <Notice kind="warn">{err}</Notice>}
      <Button title="Start en deel locatie" variant="success" onPress={start} loading={busy} />
    </Screen>
  );
}
