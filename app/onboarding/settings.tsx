import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Screen, H1, Button } from '../../src/components/ui';
import { SafetySettingsForm } from '../../src/components/SafetySettingsForm';

export default function OnboardingSettings() {
  const { t } = useTranslation();
  const update = useMutation(api.profiles.update);
  return (
    <Screen>
      <H1>{t('flow.onboard.settingsTitle')}</H1>
      <SafetySettingsForm />
      <Button title={t('flow.onboard.toDash')} onPress={async () => { await update({ onboardingDone: true }); router.replace('/dashboard'); }} />
    </Screen>
  );
}
