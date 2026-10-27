import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../src/store/app';
import { useProfile } from '../src/lib/queries';
import { isConfigured } from '../src/lib/supabase';
import { Screen, H1, P } from '../src/components/ui';

export default function Index() {
  const { ready, session } = useApp();
  const profile = useProfile();
  if (!isConfigured) return <Screen><H1>Configuratie ontbreekt</H1><P>Zet EXPO_PUBLIC_SUPABASE_URL en EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (zie README).</P></Screen>;
  if (!ready || (session && profile.isLoading)) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!session) return <Redirect href="/welcome" />;
  return <Redirect href={profile.data?.onboarding_done ? '/dashboard' : '/onboarding/location'} />;
}
