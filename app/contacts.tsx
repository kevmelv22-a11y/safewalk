import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { InvitePanel } from '../src/components/InvitePanel';
import { useContacts } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

export default function Contacts() {
  const data = useContacts();
  const removeM = useMutation(api.contacts.remove); const blockM = useMutation(api.contacts.block); 
  const mine = data?.mine ?? []; const theirs = data?.theirs ?? [];
  const fail = (e: unknown) => Alert.alert('Fout', errorNl(e));
  const remove = (id: Id<'trustedContacts'>, name: string) => Alert.alert('Contact verwijderen', `${name} verwijderen? Lopende toegang wordt direct ingetrokken.`, [
    { text: 'Annuleren', style: 'cancel' }, { text: 'Verwijderen', style: 'destructive', onPress: () => removeM({ id }).catch(fail) }]);
  const block = (userId: Id<'users'>, name: string) => Alert.alert('Blokkeren', `${name} blokkeren? Alle verbindingen worden verbroken en uitnodigingen van deze persoon werken niet meer.`, [
    { text: 'Annuleren', style: 'cancel' }, { text: 'Blokkeren', style: 'destructive', onPress: () => blockM({ userId }).catch(fail) }]);
  const report = (userId: Id<'users'>, name: string) => router.push({ pathname: '/report', params: { userId, name } });
  return (
    <Screen>
      <H1>Vertrouwde contacten</H1>
      <P muted>{mine.length}/{data?.limit ?? 2} contacten{(data?.limit ?? 2) <= 2 ? ' (gratis)' : ''}</P>
      {mine.map((c) => (
        <Card key={c.id}><P>{c.name}</P><P muted>Mag meekijken als jij dat per reis kiest; ontvangt je SOS-meldingen.</P>
          <Button title="Verwijderen" variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title="Blokkeren" variant="secondary" onPress={() => block(c.userId, c.name)} />
          <Button title="Misbruik melden" variant="secondary" onPress={() => report(c.userId, c.name)} /></Card>
      ))}
      {mine.length === 0 && <Notice kind="info">Nog geen vertrouwde contacten.</Notice>}
      <InvitePanel />
      <H1>Jij bent contact van</H1>
      {theirs.length === 0 && <P muted>Niemand.</P>}
      {theirs.map((c) => (
        <Card key={c.id}><P>{c.name}</P>
          <Button title="Stoppen als contact" variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title="Blokkeren" variant="secondary" onPress={() => block(c.userId, c.name)} />
          <Button title="Misbruik melden" variant="secondary" onPress={() => report(c.userId, c.name)} /></Card>
      ))}
    </Screen>
  );
}
