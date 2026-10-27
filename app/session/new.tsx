import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Button, Field, Notice, Card } from '../../src/components/ui';
import { useContacts } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { validateSessionInput } from '../../src/lib/safety';
import { startSharing } from '../../src/lib/location';
import { localNotify, scheduleCheckInReminder } from '../../src/lib/notifications';

export default function NewSession() {
  const startSession = useMutation(api.sessions.start);
  const contacts = useContacts()?.mine ?? [];
  const [dest, setDest] = useState('Thuis'); const [minutes, setMinutes] = useState(20);
  const [sel, setSel] = useState<Id<'users'>[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const toggle = (id: Id<'users'>) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const start = async () => {
    const arrival = new Date(Date.now() + minutes * 60_000);
    const v = validateSessionInput({ destination: dest, arrival, viewerIds: sel }); if (v) return setErr(v);
    setBusy(true); setErr(null);
    let id: Id<'sessions'>;
    try { id = await startSession({ destination: dest.trim(), expectedArrival: arrival.getTime(), viewerIds: sel }); }
    catch (e) { setBusy(false); return setErr(errorNl(e)); }
    try {
      const { background } = await startSharing(id);
      if (!background) setErr('Let op: zonder “Altijd”-toestemming stopt het delen mogelijk als de app op de achtergrond staat.');
    } catch (e) { setErr(String((e as Error).message)); }
    await scheduleCheckInReminder(arrival).catch(() => {});
    await localNotify('Reis gestart', `Je locatie wordt gedeeld tot je aankomst bevestigt of stopt.`);
    setBusy(false);
    router.replace(`/session/${id}`);
  };
  return (
    <Screen>
      <H1>Reis starten</H1>
      <Field label="Bestemming" value={dest} onChangeText={setDest} />
      <P>Ik verwacht er te zijn over</P>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {[10, 20, 30, 45, 60, 90].map((m) => <View key={m} style={{ flexGrow: 1 }}><Button title={`${m} min`} variant={m === minutes ? 'primary' : 'secondary'} onPress={() => setMinutes(m)} /></View>)}
      </View>
      <P muted>Verwachte aankomst: {new Date(Date.now() + minutes * 60_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>
      <Card>
        <P>Wie mag meekijken tijdens deze reis?</P>
        {contacts.map((c) => <Button key={c.userId} title={`${sel.includes(c.userId) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.userId) ? 'success' : 'secondary'} onPress={() => toggle(c.userId)} />)}
        <P muted>Alleen deze personen zien je locatie, en alleen tot de reis eindigt.</P>
      </Card>
      <Notice kind="info">Je telefoon vraagt nu mogelijk om locatie “Altijd” toe te staan, zodat delen doorgaat als je scherm uit is.</Notice>
      {err && <Notice kind="warn">{err}</Notice>}
      <Button title="Start en deel locatie" variant="success" onPress={start} loading={busy} />
    </Screen>
  );
}
