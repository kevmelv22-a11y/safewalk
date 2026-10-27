import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { InvitePanel } from '../src/components/InvitePanel';
import { useContacts, useMySubscription, useUserId } from '../src/lib/queries';
import { supabase } from '../src/lib/supabase';

export default function Contacts() {
  const { data = [], refetch } = useContacts(); const uid = useUserId(); const qc = useQueryClient(); const sub = useMySubscription();
  const mine = data.filter((c) => c.direction === 'mine'); const theirs = data.filter((c) => c.direction === 'theirs');
  const remove = (id: string, name: string) => Alert.alert('Contact verwijderen', `${name} verwijderen? Lopende toegang wordt direct ingetrokken.`, [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: async () => { await supabase.from('trusted_contacts').update({ status: 'removed' }).eq('id', id); refetch(); qc.invalidateQueries({ queryKey: ['sessions'] }); } },
  ]);
  const block = (other: string, name: string) => Alert.alert('Blokkeren', `${name} blokkeren? Alle verbindingen worden verbroken en nieuwe uitnodigingen van deze persoon werken niet meer.`, [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Blokkeren', style: 'destructive', onPress: async () => { await supabase.from('blocks').insert({ blocker_id: uid, blocked_id: other }); refetch(); } },
  ]);
  const report = (other: string) => Alert.alert('Misbruik melden', 'Waarom meld je deze persoon?', [
    ...(['stalking', 'harassment', 'spam'] as const).map((r) => ({ text: { stalking: 'Stalking / volgen', harassment: 'Intimidatie', spam: 'Spam' }[r],
      onPress: async () => { await supabase.from('abuse_reports').insert({ reporter_id: uid, reported_id: other, reason: r }); Alert.alert('Bedankt', 'Je melding is ontvangen. Overweeg de persoon ook te blokkeren.'); } })),
    { text: 'Annuleren', style: 'cancel' as const },
  ]);
  return (
    <Screen>
      <H1>Vertrouwde contacten</H1>
      <P muted>{mine.length}/{sub.data?.tier === 'premium' ? 20 : 2} contacten{sub.data?.tier !== 'premium' ? ' (gratis)' : ''}</P>
      {mine.map((c) => (
        <Card key={c.id}><P>{c.name}</P><P muted>Mag meekijken als jij dat per reis kiest; ontvangt je SOS-meldingen.</P>
          <Button title="Verwijderen" variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title="Blokkeren" variant="secondary" onPress={() => block(c.contact_id, c.name)} />
          <Button title="Misbruik melden" variant="secondary" onPress={() => report(c.contact_id)} /></Card>
      ))}
      {mine.length === 0 && <Notice kind="info">Nog geen vertrouwde contacten.</Notice>}
      <InvitePanel />
      <H1>Jij bent contact van</H1>
      {theirs.length === 0 && <P muted>Niemand.</P>}
      {theirs.map((c) => (
        <Card key={c.id}><P>{c.name}</P>
          <Button title="Stoppen als contact" variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title="Blokkeren" variant="secondary" onPress={() => block(c.owner_id, c.name)} />
          <Button title="Misbruik melden" variant="secondary" onPress={() => report(c.owner_id)} /></Card>
      ))}
    </Screen>
  );
}
