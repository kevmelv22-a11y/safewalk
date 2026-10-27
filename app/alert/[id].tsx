import { useLocalSearchParams, router } from 'expo-router';
import { Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { DeliveryList } from '../../src/components/DeliveryList';
import { accuracyLabel, timeAgo } from '../../src/lib/safety';

export default function AlertDetail() {
  const id = useLocalSearchParams<{ id: string }>().id as Id<'alerts'>;
  const data = useQuery(api.sos.get, { alertId: id });
  if (data === undefined) return <Screen><P>Laden…</P></Screen>;
  if (data === null) return <Screen><P>Melding niet gevonden of geen toegang.</P></Screen>;
  const a = data.alert;
  return (
    <Screen>
      <H1>{a.kind === 'sos' ? '🆘 SOS-melding' : '⚠️ Check-in gemist'}</H1>
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
      <Button title="📞 Bel 112" variant="danger" onPress={() => Linking.openURL('tel:112')} />
    </Screen>
  );
}
