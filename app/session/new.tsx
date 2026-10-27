import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, H1, P, Button, Field, Notice, Card } from '../../src/components/ui';
import { useContacts, useUserId } from '../../src/lib/queries';
import { supabase } from '../../src/lib/supabase';
import { mapErrorNl, validateSessionInput } from '../../src/lib/safety';
import { startSharing } from '../../src/lib/location';
import { scheduleCheckInReminder } from '../../src/lib/notifications';

export default function NewSession() {
  const uid = useUserId(); const qc = useQueryClient();
  const contacts = (useContacts().data ?? []).filter((c) => c.direction === 'mine');
  const [dest, setDest] = useState('Thuis'); const [minutes, setMinutes] = useState(20);
  const [sel, setSel] = useState<string[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const start = async () => {
    const arrival = new Date(Date.now() + minutes * 60_000);
    const v = validateSessionInput({ destination: dest, arrival, viewerIds: sel }); if (v) return setErr(v);
    setBusy(true); setErr(null);
    const { data: id, error } = await supabase.rpc('start_session', { p_destination: dest.trim(), p_dest_lat: null, p_dest_lng: null, p_expected_arrival: arrival.toISOString(), p_viewer_ids: sel });
    if (error) { setBusy(false); return setErr(mapErrorNl(error.message)); }
    try {
      const { background } = await startSharing(id as string, uid!);
      if (!background) setErr('Let op: zonder “Altijd”-toestemming stopt het delen mogelijk als de app op de achtergrond staat.');
    } catch (e) { setErr(String((e as Error).message)); }
    await scheduleCheckInReminder(arrival).catch(() => {});
    setBusy(false); qc.invalidateQueries({ queryKey: ['sessions'] });
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
        {contacts.map((c) => <Button key={c.contact_id} title={`${sel.includes(c.contact_id) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.contact_id) ? 'success' : 'secondary'} onPress={() => toggle(c.contact_id)} />)}
        <P muted>Alleen deze personen zien je locatie, en alleen tot de reis eindigt.</P>
      </Card>
      <Notice kind="info">Je telefoon vraagt nu mogelijk om locatie “Altijd” toe te staan, zodat delen doorgaat als je scherm uit is.</Notice>
      {err && <Notice kind="warn">{err}</Notice>}
      <Button title="Start en deel locatie" variant="success" onPress={start} loading={busy} />
    </Screen>
  );
}
