import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush(userId: string): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('safety-alerts', {
      name: 'Veiligheidsmeldingen', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400], lightColor: '#EF4444',
    });
  }
  if (!Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() });
  return token;
}

/** Lokale herinnering vlak voor de check-in-deadline (aanvulling; server bewaakt de echte deadline). */
export async function scheduleCheckInReminder(dueAt: Date) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const at = new Date(dueAt.getTime() - 60_000);
  if (at.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Alles goed?', body: 'Je verwachte aankomsttijd is bijna. Bevestig in SafeWalk of verleng.', data: { type: 'check_in' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}
export const cancelReminders = () => Notifications.cancelAllScheduledNotificationsAsync();
