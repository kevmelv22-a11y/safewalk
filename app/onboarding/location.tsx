import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { foregroundPermission } from '../../src/lib/location';
import { useProfile } from '../../src/lib/queries';

export default function LocationPermission() {
  const { t } = useTranslation();
  const profile = useProfile();
  const [denied, setDenied] = useState(false);
  const adult = profile?.ageStatus === 'adult';
  return (
    <Screen>
      <H1>{t('flow.onboard.locTitle')}</H1>
      <P>{t('flow.onboard.locBody')}</P>
      <P muted>{t('flow.onboard.locBullets')}</P>
      <Notice kind="info">{t('flow.onboard.locInfo')}</Notice>
      {denied && <Notice kind="warn">{t('flow.onboard.locDenied')}</Notice>}
      {!adult && <Notice kind="warn">{t('flow.onboard.locAge')}</Notice>}
      <Button title={t('flow.onboard.locAllow')} disabled={!adult} onPress={async () => { if (!adult) return; if (await foregroundPermission()) router.push('/onboarding/notifications'); else setDenied(true); }} />
      <Button title={t('flow.onboard.later')} variant="secondary" onPress={() => router.push('/onboarding/notifications')} />
    </Screen>
  );
}
