import { router } from 'expo-router';
import { Screen, H1, P, Button } from '../../src/components/ui';
import { InvitePanel } from '../../src/components/InvitePanel';

export default function OnboardingContacts() {
  return (
    <Screen>
      <H1>Vertrouwde contacten</H1>
      <P muted>Nodig iemand uit met een persoonlijke link. Pas als diegene accepteert, kun je hem of haar per reis laten meekijken. Gratis: maximaal 2 contacten.</P>
      <InvitePanel />
      <Button title="Volgende" onPress={() => router.push('/onboarding/settings')} />
    </Screen>
  );
}
