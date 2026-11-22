import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useConvexAuth } from 'convex/react';
import { useProfile } from '../src/lib/queries';
import { isConfigured } from '../src/lib/convex';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P } from '../src/components/ui';

export default function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useProfile();
  const { t } = useTranslation();
  if (!isConfigured) return <Screen><H1>{t('welcome.missingConfigTitle')}</H1><P>{t('welcome.missingConfigBody')}</P></Screen>;
  if (isLoading || (isAuthenticated && profile === undefined)) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (profile?.ageStatus === 'minor') return <Redirect href="/kind" />;
  if (profile?.ageStatus !== 'adult') return <Redirect href="/age" />;
  return <Redirect href={profile?.onboardingDone ? '/dashboard' : '/onboarding/location'} />;
}
