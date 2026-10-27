import { router } from 'expo-router';
import { Screen, H1, Button } from '../../src/components/ui';
import { SafetySettingsForm } from '../../src/components/SafetySettingsForm';
import { supabase } from '../../src/lib/supabase';
import { useUserId } from '../../src/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

export default function OnboardingSettings() {
  const uid = useUserId(); const qc = useQueryClient();
  return (
    <Screen>
      <H1>Veiligheidsinstellingen</H1>
      <SafetySettingsForm />
      <Button title="Naar dashboard" onPress={async () => {
        await supabase.from('profiles').update({ onboarding_done: true }).eq('id', uid!);
        await qc.invalidateQueries({ queryKey: ['profile'] });
        router.replace('/dashboard');
      }} />
    </Screen>
  );
}
