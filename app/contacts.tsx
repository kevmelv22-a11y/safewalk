import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { InvitePanel } from '../src/components/InvitePanel';
import { useContacts } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';
import { confirmAction, showError } from '../src/lib/confirm';

export default function Contacts() {
  const data = useContacts();
  const removeM = useMutation(api.contacts.remove); const blockM = useMutation(api.contacts.block);
  const mine = data?.mine ?? []; const theirs = data?.theirs ?? [];
  const fail = (e: unknown) => showError(errorNl(e));
  const remove = (id: Id<'trustedContacts'>, name: string) => confirmAction('Contact verwijderen', `${name} verwijderen? Lopende toegang wordt direct ingetrokken.`, 'Verwijderen', () => { removeM({ id }).catch(fail); });
  const block = (userId: Id<'users'>, name: string) => confirmAction('Blokkeren', `${name} blokkeren? Alle verbindingen worden verbroken en uitnodigingen van deze persoon werken niet meer.`, 'Blokkeren', () => { blockM({ userId }).catch(fail); });
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
      {data === undefined && <ActivityIndicator accessibilityLabel="Contacten laden" />}
      {data && mine.length === 0 && <Notice kind="info">Nog geen vertrouwde contacten. Nodig hieronder iemand uit die je vertrouwt; diegene moet de uitnodiging zelf accepteren.</Notice>}
      <InvitePanel />
      <H1>Jij bent contact van</H1>
      {data && theirs.length === 0 && <P muted>Nog niemand heeft jou als vertrouwd contact toegevoegd.</P>}
      {theirs.map((c) => (
        <Card key={c.id}><P>{c.name}</P>
          <Button title="Stoppen als contact" variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title="Blokkeren" variant="secondary" onPress={() => block(c.userId, c.name)} />
          <Button title="Misbruik melden" variant="secondary" onPress={() => report(c.userId, c.name)} /></Card>
      ))}
    </Screen>
  );
}
