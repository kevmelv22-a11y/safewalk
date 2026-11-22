import React, { useEffect } from 'react';
import { LocaleProvider as NavigationLocale, Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LocaleProvider, useLocale } from '../src/i18n/provider';
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
import { HomeCheckInBoundary, HomeCheckInKeeper } from '../src/lib/homeCheckInKeeper';

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

function RootNavigation() {
  const theme = useTheme();
  const isDark = useIsDark();
  const { t } = useTranslation();
  const { language } = useLocale();
  const direction = language === 'ar' ? 'rtl' : 'ltr';
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
      const d = r.notification.request.content.data as { type?: string; sessionId?: string; alertId?: string; homeCheckInId?: string };
      const action = r.actionIdentifier;
      if (action === 'QUICK_PING') { openQuickPing(); return; }
      const fake = paramsFromNotificationData(d);
      if (fake) { openRingOnce(() => router.push({ pathname: '/fake-call-ring', params: fake })); return; }
      if (typeof d.homeCheckInId === 'string' && d.homeCheckInId) { router.push(`/check-in/${d.homeCheckInId}`); return; }
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
        <HomeCheckInBoundary>
          <HomeCheckInKeeper />
        </HomeCheckInBoundary>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <NavigationLocale direction={direction}>
        <Stack screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.bg }, headerBackTitle: t('common.back') }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="age" options={{ title: t('screens.age'), headerBackVisible: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ title: t('screens.dashboard'), headerBackVisible: false }} />
          <Stack.Screen name="login" options={{ title: t('screens.login') }} />
          <Stack.Screen name="signup" options={{ title: t('screens.signup') }} />
          <Stack.Screen name="forgot-password" options={{ title: t('screens.forgot') }} />
          <Stack.Screen name="reset-password" options={{ title: t('screens.reset') }} />
          <Stack.Screen name="verify-email" options={{ title: t('screens.verify') }} />
          <Stack.Screen name="alert/[id]" options={{ title: t('screens.alert') }} />
          <Stack.Screen name="assistant" options={{ title: t('screens.assistant') }} />
          <Stack.Screen name="contacts" options={{ title: t('screens.contacts') }} />
          <Stack.Screen name="history" options={{ title: t('screens.history') }} />
          <Stack.Screen name="invite/[token]" options={{ title: t('screens.invite') }} />
          <Stack.Screen name="onboarding/contacts" options={{ title: t('screens.onContacts') }} />
          <Stack.Screen name="onboarding/location" options={{ title: t('screens.onLocation') }} />
          <Stack.Screen name="onboarding/notifications" options={{ title: t('screens.onNotifications') }} />
          <Stack.Screen name="onboarding/pin" options={{ title: t('screens.onPin') }} />
          <Stack.Screen name="onboarding/settings" options={{ title: t('screens.onSettings') }} />
          <Stack.Screen name="premium" options={{ title: t('screens.premium') }} />
          <Stack.Screen name="report" options={{ title: t('screens.report') }} />
          <Stack.Screen name="session/[id]" options={{ title: t('screens.session') }} />
          <Stack.Screen name="session/destination" options={{ title: t('screens.destination') }} />
          <Stack.Screen name="session/new" options={{ title: t('screens.newTrip') }} />
          <Stack.Screen name="session/delen" options={{ title: t('screens.share') }} />
          <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
          <Stack.Screen name="settings/land" options={{ title: t('screens.country') }} />
          <Stack.Screen name="watch/[id]" options={{ title: t('screens.watch') }} />
          <Stack.Screen name="privacy" options={{ title: t('screens.privacy') }} />
          <Stack.Screen name="terms" options={{ title: t('screens.terms') }} />
          <Stack.Screen name="share-link" options={{ title: t('screens.shareLink') }} />
          <Stack.Screen name="device-contacts" options={{ title: t('screens.deviceContacts') }} />
          <Stack.Screen name="recordings" options={{ title: t('screens.recordings') }} />
          <Stack.Screen name="settings/pin" options={{ title: t('screens.pin') }} />
          <Stack.Screen name="settings/auto-sms" options={{ title: t('screens.autoSms') }} />
          <Stack.Screen name="settings/dwangcode" options={{ title: t('screens.duress') }} />
          <Stack.Screen name="hulplijnen" options={{ title: t('screens.helplines') }} />
          <Stack.Screen name="noodinfo" options={{ title: t('screens.ice') }} />
          <Stack.Screen name="veilige-plekken" options={{ title: t('screens.places') }} />
          <Stack.Screen name="quick-ping" options={{ title: t('screens.quick') }} />
          <Stack.Screen name="danger" options={{ title: t('screens.danger'), headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="sos" options={{ title: t('screens.sos'), presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="check-in/index" options={{ title: t('screens.checkin') }} />
          <Stack.Screen name="check-in/nieuw" options={{ title: t('screens.checkinNew') }} />
          <Stack.Screen name="check-in/[id]" options={{ title: t('screens.checkinOne') }} />
          <Stack.Screen name="fake-call" options={{ title: t('screens.fake') }} />
          <Stack.Screen name="fake-call-ring" options={{ title: t('screens.fakeRing'), presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="kind" options={{ title: t('screens.child'), headerBackVisible: false }} />
          <Stack.Screen name="kind/koppelen" options={{ title: t('screens.childLink') }} />
          <Stack.Screen name="settings/kinderen" options={{ title: t('screens.children') }} />
          <Stack.Screen name="ouder/[linkId]" options={{ title: t('screens.parent') }} />
          <Stack.Screen name="scherm" options={{ headerShown: false }} />
        </Stack>
        </NavigationLocale>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <LocaleProvider>
      <RootNavigation />
    </LocaleProvider>
  );
}
