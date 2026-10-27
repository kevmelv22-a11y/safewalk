import '../src/lib/location'; // registreert de achtergrondtaak op top-level
import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { convex, tokenStorage } from '../src/lib/convex';
import { startSosRetry } from '../src/lib/sos';
import { useTheme } from '../src/lib/theme';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { configurePurchases } from '../src/lib/purchases';

function PurchasesBootstrap() {
  const status = useQuery(api.billing.status);
  useEffect(() => { if (status?.userId) configurePurchases(status.userId).catch(() => {}); }, [status?.userId]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  useEffect(() => {
    const stopRetry = startSosRetry();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { type?: string; sessionId?: string; alertId?: string };
      if ((d.type === 'sos' || d.type === 'missed_check_in') && d.alertId) router.push(`/alert/${d.alertId}`);
      else if (d.type === 'check_in' && d.sessionId) router.push(`/session/${d.sessionId}`);
    });
    return () => { stopRetry(); sub.remove(); };
  }, []);
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider client={convex} storage={tokenStorage}>
        <PurchasesBootstrap />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Terug' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ title: 'SafeWalk', headerBackVisible: false }} />
          <Stack.Screen name="sos" options={{ title: 'SOS', presentation: 'fullScreenModal', headerShown: false }} />
        </Stack>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
