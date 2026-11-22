import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button } from '../../src/components/ui';
import { InvitePanel } from '../../src/components/InvitePanel';

export default function OnboardingContacts() {
  const { t } = useTranslation();
  return (
    <Screen>
      <H1>{t('flow.onboard.contactsTitle')}</H1>
      <P muted>{t('flow.onboard.contactsBody')}</P>
      <InvitePanel />
      <Button title={t('flow.onboard.next')} onPress={() => router.push('/onboarding/pin')} />
    </Screen>
  );
}
