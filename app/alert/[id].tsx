import { useLocalSearchParams, router } from 'expo-router';
import { Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { DeliveryList } from '../../src/components/DeliveryList';
import { accuracyLabel, alertTitle, timeAgo } from '../../src/lib/safety';
import { COPY as DialCopy, onPressOpen112 } from '../../src/lib/dial112';

export default function AlertDetail() {
  const id = useLocalSearchParams<{ id: string }>().id as Id<'alerts'>;
  const data = useQuery(api.sos.get, { alertId: id });
  if (data === undefined) return <Screen><P muted>Melding laden…</P></Screen>;
  if (data === null) return (
    <Screen>
      <Notice kind="info">Deze melding bestaat niet meer of is niet voor jou bedoeld.</Notice>
      <Button title="Naar het startscherm" variant="secondary" onPress={() => router.replace('/dashboard')} />
    </Screen>
  );
  const a = data.alert;
  const head = alertTitle(a.kind, a.clientRef);
  return (
    <Screen>
      <H1>{head.title}</H1>
      {!data.isOwner && head.explain ? <P muted>{head.explain}</P> : null}
      {a.status === 'cancelled' && <Notice kind="ok">De afzender heeft aangegeven dat alles goed is (vals alarm).</Notice>}
      <Card>
        <P>Gemeld: {new Date(a._creationTime).toLocaleString('nl-NL')}</P>
        {a.lat !== undefined ? <>
          <P muted>Laatst bekende locatie ({timeAgo(a.locationAt)}) · {accuracyLabel(a.accuracyM)}</P>
          <Button title="Open in kaarten" variant="secondary" onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lng}`)} />
        </> : <P muted>Geen locatie beschikbaar.</P>}
      </Card>
      {data.isOwner && <DeliveryList deliveries={data.deliveries} />}
      {a.sessionId && !data.isOwner && <Button title="Live kaart (indien nog gedeeld)" variant="secondary" onPress={() => router.push(`/watch/${a.sessionId}`)} />}
      <Notice kind="warn">Probeer eerst zelf contact op te nemen. Bel bij direct gevaar 112 – SafeWalk doet dat niet automatisch.</Notice>
      <Button title={DialCopy.title} variant="danger" hint={DialCopy.hint} onPress={() => { void onPressOpen112(); }} />
    </Screen>
  );
}
