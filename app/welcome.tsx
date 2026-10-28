import { router } from 'expo-router';
import { Screen, H1, P, Button, Disclaimer } from '../src/components/ui';
import { Logo } from '../src/components/Logo';

export default function Welcome() {
  return (
    <Screen>
      <Logo size="large" />
      <H1>Samen veilig thuis</H1>
      <P muted>Deel je reis tijdelijk met mensen die je vertrouwt. Kom je niet op tijd aan en bevestig je niet dat alles goed is? Dan worden je contacten gewaarschuwd.</P>
      <P muted>• Jij bepaalt wie meekijkt, per reis{'\n'}• Delen stopt automatisch na je reis{'\n'}• Grote SOS-knop om contacten te alarmeren</P>
      <Disclaimer />
      <Button title="Account aanmaken" onPress={() => router.push('/signup')} />
      <Button title="Inloggen" variant="secondary" onPress={() => router.push('/login')} />
    </Screen>
  );
}
