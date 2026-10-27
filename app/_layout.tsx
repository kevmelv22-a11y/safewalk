import '../src/lib/location'; // registreert de achtergrondtaak op top-level
import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useApp } from '../src/store/app';
import { startSosRetry } from '../src/lib/sos';
import { useTheme } from '../src/lib/theme';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 10_000 } } });

export default function RootLayout() {
  const setSession = useApp((s) => s.setSession);
  const t = useTheme();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); qc.invalidateQueries(); });
    const stopRetry = startSosRetry();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { type?: string; session_id?: string; alert_id?: string };
      if ((d.type === 'sos' || d.type === 'missed_check_in') && d.alert_id) router.push(`/alert/${d.alert_id}`);
      else if (d.type === 'check_in' && d.session_id) router.push(`/session/${d.session_id}`);
    });
    return () => { data.subscription.unsubscribe(); stopRetry(); sub.remove(); };
  }, [setSession]);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Terug' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ title: 'SafeWalk', headerBackVisible: false }} />
          <Stack.Screen name="sos" options={{ title: 'SOS', presentation: 'fullScreenModal', headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
