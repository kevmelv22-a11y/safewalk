import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { formatCountdown } from '../../src/lib/safety';

export default function Watch() {
  const id = useLocalSearchParams<{ id: string }>().id as Id<'sessions'>; const now = useNow(1000);
  const trail = useLiveLocations(id);
  const data = useQuery(api.sessions.get, { sessionId: id });
  // Server geeft null na intrekken/einde/verlopen/blokkeren — reactief, dus direct
  if (data === null) return <Screen><H1>Geen toegang</H1><P muted>Deze reis is beëindigd, verlopen of je toegang is ingetrokken.</P></Screen>;
  if (!data) return <Screen><P>Laden…</P></Screen>;
  const s = data.session;
  return (
    <Screen>
      <H1>{data.ownerName} → {s.destinationLabel}</H1>
      {s.status === 'alert' && <Notice kind="danger">{data.ownerName} heeft niet op tijd ingecheckt. Probeer contact op te nemen. Bel bij direct gevaar zelf 112.</Notice>}
      <Card><P>Verwachte aankomst {new Date(s.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>
        <P muted>{s.expectedArrival > now ? `nog ${formatCountdown(s.expectedArrival - now)}` : 'Verwachte tijd verstreken'}</P></Card>
      <LiveMap trail={trail} dest={s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng, label: s.destinationLabel } : null} now={now} />
      <Button title="📞 Bel zelf 112" variant="danger" hint="Opent je telefoon-app; SafeWalk belt niet automatisch" onPress={() => Linking.openURL('tel:112')} />
    </Screen>
  );
}
