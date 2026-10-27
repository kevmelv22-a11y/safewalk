import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { PersistentQueue } from './queue';

export const LOCATION_TASK = 'safewalk-location';
const ACTIVE_KEY = 'safewalk.activeSession';
type LocRow = { session_id: string; user_id: string; lat: number; lng: number; accuracy_m: number | null; recorded_at: string };
export const locationQueue = new PersistentQueue<LocRow>(AsyncStorage, 'safewalk.locationQueue', 20);

async function upload(locs: Location.LocationObject[]) {
  const raw = await AsyncStorage.getItem(ACTIVE_KEY);
  if (!raw) return;
  const { sessionId, userId } = JSON.parse(raw);
  for (const l of locs) {
    const row: LocRow = { session_id: sessionId, user_id: userId, lat: l.coords.latitude, lng: l.coords.longitude,
      accuracy_m: l.coords.accuracy ?? null, recorded_at: new Date(l.timestamp).toISOString() };
    await locationQueue.push(`${sessionId}:${l.timestamp}`, row);
  }
  await locationQueue.flush(async (row) => {
    const { error } = await supabase.from('location_updates').insert(row);
    // RLS-weigering (sessie beëindigd/verlopen) → niet opnieuw proberen
    if (error && !/row-level security/.test(error.message)) throw error;
  });
}

// Moet op top-level gedefinieerd worden (draait ook als de app op de achtergrond is).
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (locations?.length) await upload(locations);
});

export async function foregroundPermission() {
  return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
}

/** Start delen. Achtergrondtoestemming wordt pas HIER gevraagd (bij sessiestart). */
export async function startSharing(sessionId: string, userId: string): Promise<{ background: boolean }> {
  if (!(await foregroundPermission())) throw new Error('Locatietoestemming is nodig om je reis te delen.');
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ sessionId, userId }));
  const bg = (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (now) await upload([now]);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 30_000, deferredUpdatesInterval: 30_000,
    showsBackgroundLocationIndicator: true, pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    foregroundService: { notificationTitle: 'SafeWalk deelt je locatie', notificationBody: 'Je reis wordt gedeeld met je gekozen contacten. Stop via de app.', notificationColor: '#7856FF' },
  });
  return { background: bg };
}

export async function stopSharing() {
  await AsyncStorage.removeItem(ACTIVE_KEY);
  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export async function lastKnown() {
  const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}).catch(() => null));
  return l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracy_m: l.coords.accuracy ?? null, location_at: new Date(l.timestamp).toISOString() } : null;
}
