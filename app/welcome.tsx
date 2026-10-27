import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen, H1, P, Button, Disclaimer } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';

export default function Welcome() {
  const t = useTheme();
  return (
    <Screen>
      <View style={{ height: 40 }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.purple }} accessibilityElementsHidden />
      <H1>SafeWalk – Samen veilig thuis</H1>
      <P muted>Deel je reis tijdelijk met mensen die je vertrouwt. Kom je niet op tijd aan en bevestig je niet dat alles goed is? Dan worden je contacten gewaarschuwd.</P>
      <P muted>• Jij bepaalt wie meekijkt, per reis{'\n'}• Delen stopt automatisch na je reis{'\n'}• Grote SOS-knop om contacten te alarmeren</P>
      <Disclaimer />
      <Button title="Account aanmaken" onPress={() => router.push('/signup')} />
      <Button title="Inloggen" variant="secondary" onPress={() => router.push('/login')} />
    </Screen>
  );
}
