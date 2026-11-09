import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useConvexAuth } from 'convex/react';
import { useProfile } from '../src/lib/queries';
import { isConfigured } from '../src/lib/convex';
import { Screen, H1, P } from '../src/components/ui';

export default function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useProfile();
  if (!isConfigured) return <Screen><H1>Configuratie ontbreekt</H1><P>Zet EXPO_PUBLIC_CONVEX_URL in .env (zie README).</P></Screen>;
  if (isLoading || (isAuthenticated && profile === undefined)) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (profile?.ageStatus !== 'adult') return <Redirect href="/age" />;
  return <Redirect href={profile?.onboardingDone ? '/dashboard' : '/onboarding/location'} />;
}
