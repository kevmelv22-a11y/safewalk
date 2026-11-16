import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { convex, tokenStorage } from '../src/lib/convex';
import { startOfflineRetry } from '../src/lib/offlineRetry';
import { useIsDark, useTheme } from '../src/lib/theme';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { configurePurchases } from '../src/lib/purchases';
import { AlarmGuard } from '../src/lib/alarmGuard';
import { cleanupPlaybackLeftovers } from '../src/lib/playbackFile';
import { handleVolumeDoublePress } from '../src/lib/volumeAction';
import { getVolumeSendOptIn } from '../src/lib/recordingPrefs';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { initQuickActions, initVolumeDoublePress, openQuickPing } from '../src/lib/nativeEntryPoints';
import { useProfile } from '../src/lib/queries';
import { SharingKeeper } from '../src/lib/sharingKeeper';
import { AutoSmsKeeper } from '../src/lib/autoSmsKeeper';
import { ShakeSosListener } from '../src/components/ShakeSosListener';
import { registerPush } from '../src/lib/notifications';
import { paramsFromNotificationData } from '../src/lib/fakeCall';
import { openRingOnce } from '../src/lib/fakeCallRunner';

function PurchasesBootstrap() {
  const status = useQuery(api.billing.status);
  const profile = useProfile();
  useEffect(() => {
    if (status?.userId && profile?.ageStatus === 'adult') configurePurchases(status.userId).catch(() => {});
  }, [status?.userId, profile?.ageStatus]);
  // Pushtoken stil verversen (zonder toestemmingsvraag): wie inlogt op een nieuw toestel slaat de
  // onboarding over en zou anders nooit meldingen van contacten krijgen.
  useEffect(() => {
    if (status?.userId && profile?.ageStatus === 'adult' && profile.onboardingDone) void registerPush({ prompt: false }).catch(() => {});
  }, [status?.userId, profile?.ageStatus, profile?.onboardingDone]);
  return null;
}

export default function RootLayout() {
  const t = useTheme(); const isDark = useIsDark();
  useEffect(() => {
    const stopRetry = startOfflineRetry();
    cleanupPlaybackLeftovers(); // only sw-play-* in the app's own playback cache dir
    initQuickActions().catch(() => undefined);
    const vol = initVolumeDoublePress(() => {
      void handleVolumeDoublePress({
        optedIn: getVolumeSendOptIn,
        getLocation: getConsentedLocation,
        send: (loc) => convex.mutation(api.incidents.sendLiveLocationNow, loc),
        navigate: (href) => router.push(href as never),
      });
    });
    void vol;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { type?: string; sessionId?: string; alertId?: string };
      const action = r.actionIdentifier;
      if (action === 'QUICK_PING') { openQuickPing(); return; }
      const fake = paramsFromNotificationData(d);
      if (fake) { openRingOnce(() => router.push({ pathname: '/fake-call-ring', params: fake })); return; }
      if ((d.type === 'sos' || d.type === 'missed_check_in') && d.alertId) router.push(`/alert/${d.alertId}`);
      else if (d.type === 'check_in' && d.sessionId) router.push(`/session/${d.sessionId}`);
      else if (d.type === 'unsafe' || d.type === 'wrong_pin' || d.type === 'come_quick') {
        if (d.alertId) router.push(`/alert/${d.alertId}`);
      }
    });
    // Ingeplande nep-oproep terwijl de app open is: meteen het belscherm (de melding zelf wordt niet getoond).
    const received = Notifications.addNotificationReceivedListener((n) => {
      const fake = paramsFromNotificationData(n.request.content.data);
      if (fake) openRingOnce(() => router.push({ pathname: '/fake-call-ring', params: fake }));
    });
    return () => { stopRetry(); sub.remove(); received.remove(); };
  }, []);
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider client={convex} storage={tokenStorage}>
        <PurchasesBootstrap />
        <AlarmGuard />
        <SharingKeeper />
        <AutoSmsKeeper />
        <ShakeSosListener />
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Terug' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="age" options={{ title: 'Leeftijd', headerBackVisible: false }} />
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
          <Stack.Screen name="onboarding/pin" options={{ title: 'Veiligheidscode' }} />
          <Stack.Screen name="onboarding/settings" options={{ title: 'Veiligheid' }} />
          <Stack.Screen name="premium" options={{ title: 'Premium' }} />
          <Stack.Screen name="report" options={{ title: 'Misbruik melden' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Reis' }} />
          <Stack.Screen name="session/destination" options={{ title: 'Bestemming' }} />
          <Stack.Screen name="session/new" options={{ title: 'Reis of timer' }} />
          <Stack.Screen name="session/delen" options={{ title: 'Locatie delen' }} />
          <Stack.Screen name="settings" options={{ title: 'Instellingen' }} />
          <Stack.Screen name="watch/[id]" options={{ title: 'Meekijken' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacybeleid' }} />
          <Stack.Screen name="terms" options={{ title: 'Gebruiksvoorwaarden' }} />
          <Stack.Screen name="share-link" options={{ title: 'Meekijklink' }} />
          <Stack.Screen name="device-contacts" options={{ title: 'Telefooncontacten' }} />
          <Stack.Screen name="recordings" options={{ title: 'Opnames' }} />
          <Stack.Screen name="settings/pin" options={{ title: 'Code wijzigen' }} />
          <Stack.Screen name="settings/auto-sms" options={{ title: 'Automatische sms' }} />
          <Stack.Screen name="settings/dwangcode" options={{ title: 'Dwangcode' }} />
          <Stack.Screen name="hulplijnen" options={{ title: 'Hulplijnen' }} />
          <Stack.Screen name="noodinfo" options={{ title: 'Noodinfo' }} />
          <Stack.Screen name="veilige-plekken" options={{ title: 'Plekken in de buurt' }} />
          <Stack.Screen name="quick-ping" options={{ title: "Locatie sturen" }} />
          <Stack.Screen name="danger" options={{ title: "Gevaarmodus", headerShown: false, presentation: "fullScreenModal" }} />
          <Stack.Screen name="sos" options={{ title: 'SOS', presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="fake-call" options={{ title: 'Nep-oproep' }} />
          <Stack.Screen name="fake-call-ring" options={{ title: 'Oproep', presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="kind" options={{ title: 'Kindermodus', headerBackVisible: false }} />
          <Stack.Screen name="kind/koppelen" options={{ title: 'Koppelen aan ouder' }} />
          <Stack.Screen name="settings/kinderen" options={{ title: 'Kinderen' }} />
          <Stack.Screen name="ouder/[linkId]" options={{ title: 'Kind volgen' }} />
        </Stack>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
