import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { convex } from './convex';
import { api } from '../../convex/_generated/api';
import { localReminderAt } from './homeCheckIn';

Notifications.setNotificationHandler({
  // Nep-oproep terwijl de app open is: geen banner, het belscherm opent zelf (zie _layout).
  handleNotification: async (n) => {
    const fake = (n.request.content.data as { type?: string } | null)?.type === 'fake_call';
    return { shouldShowBanner: !fake, shouldShowList: !fake, shouldPlaySound: !fake, shouldSetBadge: false };
  },
});

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'web' | 'simulator' | 'permission_denied' | 'no_project_id' | 'token_failed' | 'register_failed'; detail?: string };

/** Android notification actions → deep link (lokaal; remote push data handled in _layout). */
export async function ensureNotificationCategories() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync('safety', [
    {
      identifier: 'QUICK_PING',
      buttonTitle: 'Stuur locatie',
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Registreert het pushtoken van dit toestel bij de server.
 * prompt=false: vraagt nooit om toestemming (stil verversen bij app-start, bv. na inloggen op een nieuw toestel).
 */
export async function registerPush(opts: { prompt?: boolean } = {}): Promise<PushRegistrationResult> {
  const prompt = opts.prompt ?? true;
  if (Platform.OS === 'web') return { ok: false, reason: 'web', detail: 'Web heeft geen Expo push tokens' };
  await ensureNotificationCategories();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('safety-alerts', {
      name: 'Veiligheidsmeldingen',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#EF4444',
      bypassDnd: false,
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Algemeen',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  if (!Device.isDevice) {
    return { ok: false, reason: 'simulator', detail: 'Push vereist fysiek toestel; simulator/emulator geeft geen betrouwbare APNs/FCM token' };
  }
  const perm = prompt ? await Notifications.requestPermissionsAsync() : await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') {
    return { ok: false, reason: 'permission_denied', detail: 'Notificatietoestemming geweigerd' };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    return { ok: false, reason: 'no_project_id', detail: 'EAS projectId ontbreekt in app config' };
  }
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    return {
      ok: false,
      reason: 'token_failed',
      detail: 'Token ophalen mislukt (vaak: ontbrekende APNs-key in Expo/EAS of FCM config). ' + String(e).slice(0, 160),
    };
  }
  try {
    await convex.mutation(api.profiles.registerPushToken, { token, platform: Platform.OS });
  } catch (e) {
    return { ok: false, reason: 'register_failed', detail: String(e).slice(0, 160) };
  }
  return { ok: true, token };
}

/** Lokale herinnering vlak voor de check-in-deadline (aanvulling; server bewaakt de echte deadline). */
const CHECK_IN_REMINDER_ID = 'safewalk-check-in-reminder';

/** Alleen check-in-herinneringen annuleren (niet bv. een ingeplande nep-oproep). */
export async function cancelReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of all) {
    const type = (n.content.data as { type?: string } | null)?.type;
    if (n.identifier === CHECK_IN_REMINDER_ID || type === 'check_in') await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
  }
}

export async function scheduleCheckInReminder(dueAt: Date) {
  await cancelReminders();
  const at = new Date(dueAt.getTime() - 60_000);
  if (at.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: CHECK_IN_REMINDER_ID,
    content: {
      title: 'Alles goed?',
      body: 'Je verwachte aankomsttijd is bijna. Bevestig in SafeWalk of verleng.',
      data: { type: 'check_in' },
      categoryIdentifier: 'safety',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

const HOME_REMINDER_PREFIX = 'safewalk-home-checkin-';

/**
 * Lokale herinnering per thuis-check-in. De server blijft de echte bewaking;
 * op web is een lokale herinnering niet beschikbaar.
 */
export async function syncHomeCheckInReminders(items: { id: string; dueAt: number }[]) {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const want = new Set(items.map((i) => `${HOME_REMINDER_PREFIX}${i.id}`));
  for (const n of all) {
    const type = (n.content.data as { type?: string } | null)?.type;
    if (type === 'home_check_in' && !want.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
  }
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm || perm.status !== 'granted') return;
  const now = Date.now();
  for (const item of items) {
    const at = localReminderAt(item.dueAt, now);
    const identifier = `${HOME_REMINDER_PREFIX}${item.id}`;
    if (at === null) {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      continue;
    }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Thuis-check-in',
        body: 'Je tijd is bijna. Bevestig in SafeWalk dat je thuis bent, of verleng.',
        data: { type: 'home_check_in', homeCheckInId: item.id },
        categoryIdentifier: 'safety',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    }).catch(() => undefined);
  }
}

export const localNotify = (title: string, body: string) =>
  Notifications.scheduleNotificationAsync({
    content: { title, body, categoryIdentifier: 'safety' },
    trigger: null,
  }).catch(() => undefined);
