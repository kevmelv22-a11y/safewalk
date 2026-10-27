import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, Button } from '../../src/components/ui';
import { SafetySettingsForm } from '../../src/components/SafetySettingsForm';

export default function OnboardingSettings() {
  const update = useMutation(api.profiles.update);
  return (
    <Screen>
      <H1>Veiligheidsinstellingen</H1>
      <SafetySettingsForm />
      <Button title="Naar dashboard" onPress={async () => { await update({ onboardingDone: true }); router.replace('/dashboard'); }} />
    </Screen>
  );
}
