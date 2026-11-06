import '../src/lib/location'; // registreert de achtergrondtaak op top-level
import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { convex, tokenStorage } from '../src/lib/convex';
import { startSosRetry } from '../src/lib/sos';
import { useIsDark, useTheme } from '../src/lib/theme';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { configurePurchases } from '../src/lib/purchases';
import { AlarmGuard } from '../src/lib/alarmGuard';
import { initQuickActions, initVolumeDoublePress, openQuickPing } from '../src/lib/nativeEntryPoints';

function PurchasesBootstrap() {
  const status = useQuery(api.billing.status);
  useEffect(() => { if (status?.userId) configurePurchases(status.userId).catch(() => {}); }, [status?.userId]);
  return null;
}

export default function RootLayout() {
  const t = useTheme(); const isDark = useIsDark();
  useEffect(() => {
    const stopRetry = startSosRetry();
    initQuickActions().catch(() => undefined);
    const vol = initVolumeDoublePress(() => openQuickPing());
    void vol;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { type?: string; sessionId?: string; alertId?: string };
      const action = r.actionIdentifier;
      if (action === 'QUICK_PING') { openQuickPing(); return; }
      if ((d.type === 'sos' || d.type === 'missed_check_in') && d.alertId) router.push(`/alert/${d.alertId}`);
      else if (d.type === 'check_in' && d.sessionId) router.push(`/session/${d.sessionId}`);
      else if (d.type === 'unsafe' || d.type === 'wrong_pin' || d.type === 'come_quick') {
        if (d.alertId) router.push(`/alert/${d.alertId}`);
      }
    });
    return () => { stopRetry(); sub.remove(); };
  }, []);
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider client={convex} storage={tokenStorage}>
        <PurchasesBootstrap />
        <AlarmGuard />
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Terug' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ title: 'SafeWalk', headerBackVisible: false }} />
          <Stack.Screen name="login" options={{ title: 'Inloggen' }} />
          <Stack.Screen name="signup" options={{ title: 'Account aanmaken' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Wachtwoord vergeten' }} />
          <Stack.Screen name="reset-password" options={{ title: 'Nieuw wachtwoord' }} />
          <Stack.Screen name="verify-email" options={{ title: 'E-mail bevestigen' }} />
          <Stack.Screen name="alert/[id]" options={{ title: 'Melding' }} />
          <Stack.Screen name="assistant" options={{ title: 'Veiligheidsassistent' }} />
          <Stack.Screen name="contacts" options={{ title: 'Vertrouwde contacten' }} />
          <Stack.Screen name="history" options={{ title: 'Reisgeschiedenis' }} />
          <Stack.Screen name="invite/[token]" options={{ title: 'Uitnodiging' }} />
          <Stack.Screen name="onboarding/contacts" options={{ title: 'Contacten' }} />
          <Stack.Screen name="onboarding/location" options={{ title: 'Locatie' }} />
          <Stack.Screen name="onboarding/notifications" options={{ title: 'Meldingen' }} />
          <Stack.Screen name="onboarding/pin" options={{ title: 'Veiligheids-PIN' }} />
          <Stack.Screen name="onboarding/settings" options={{ title: 'Veiligheid' }} />
          <Stack.Screen name="premium" options={{ title: 'Premium' }} />
          <Stack.Screen name="report" options={{ title: 'Misbruik melden' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Reis' }} />
          <Stack.Screen name="session/destination" options={{ title: 'Bestemming' }} />
          <Stack.Screen name="session/new" options={{ title: 'Nieuwe reis' }} />
          <Stack.Screen name="settings" options={{ title: 'Instellingen' }} />
          <Stack.Screen name="watch/[id]" options={{ title: 'Meekijken' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacybeleid' }} />
          <Stack.Screen name="terms" options={{ title: 'Gebruiksvoorwaarden' }} />
          <Stack.Screen name="share-link" options={{ title: 'Tracking-link' }} />
          <Stack.Screen name="device-contacts" options={{ title: 'Telefooncontacten' }} />
          <Stack.Screen name="recordings" options={{ title: 'Opnames' }} />
          <Stack.Screen name="settings/pin" options={{ title: 'PIN wijzigen' }} />
          <Stack.Screen name="quick-ping" options={{ title: "Live locatie" }} />
          <Stack.Screen name="danger" options={{ title: "Gevaarmodus", headerShown: false, presentation: "fullScreenModal" }} />
          <Stack.Screen name="sos" options={{ title: 'SOS', presentation: 'fullScreenModal', headerShown: false }} />
        </Stack>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
