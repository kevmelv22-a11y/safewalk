import { router } from 'expo-router';
import { Linking } from 'react-native';
import { Screen, Button, Card, P, Notice, Disclaimer } from '../src/components/ui';
import { SosButton } from '../src/components/SosButton';
import { useContacts, useSessions } from '../src/lib/queries';
import { formatCountdown } from '../src/lib/safety';
import { useNow } from '../src/lib/useLiveLocations';

export default function Dashboard() {
  const sessions = useSessions(); const contacts = useContacts(); const now = useNow(1000);
  const mine = sessions?.mine; const watching = sessions?.watching ?? [];
  const myContacts = contacts?.mine ?? [];
  return (
    <Screen>
      <SosButton sessionId={mine?._id} />
      <Button title="📞 Bel zelf 112" variant="secondary" hint="Opent de telefoon-app met 112. SafeWalk belt niet zelf." onPress={() => Linking.openURL('tel:112')} />
      {mine ? (
        <Card style={{ borderColor: mine.status === 'alert' ? '#EF4444' : '#22C55E' }}>
          <P>{mine.status === 'alert' ? '⚠️ Check-in gemist – contacten gewaarschuwd' : '🟢 Onderweg naar ' + mine.destinationLabel}</P>
          <P muted>Verwachte aankomst {new Date(mine.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · nog {formatCountdown(new Date(mine.expectedArrival).getTime() - now)}</P>
          <Button title="Sessie openen" onPress={() => router.push(`/session/${mine._id}`)} />
        </Card>
      ) : (
        <Card>
          <P>Geen actieve reis</P>
          {myContacts.length === 0 && <Notice kind="info">Voeg eerst een vertrouwd contact toe om je reis te kunnen delen.</Notice>}
          <Button title="Veilig naar huis – start reis" variant="success" disabled={myContacts.length === 0} onPress={() => router.push('/session/new')} />
        </Card>
      )}
      {watching.map((s) => (
        <Card key={s._id}>
          <P>👀 {s.ownerName} → {s.destinationLabel}</P>
          <Button title="Live kaart bekijken" variant="secondary" onPress={() => router.push(`/watch/${s._id}`)} />
        </Card>
      ))}
      <Button title="Vertrouwde contacten" variant="secondary" onPress={() => router.push('/contacts')} />
      <Button title="Geschiedenis" variant="secondary" onPress={() => router.push('/history')} />
      <Button title="⭐ Premium" variant="secondary" onPress={() => router.push('/premium')} />
      <Button title="Instellingen & privacy" variant="secondary" onPress={() => router.push('/settings')} />
      <Disclaimer />
    </Screen>
  );
}
