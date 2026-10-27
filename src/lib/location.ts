import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { convex, errorCode } from './convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { PersistentQueue } from './queue';

export const LOCATION_TASK = 'safewalk-location';
const ACTIVE_KEY = 'safewalk.activeSession';
type LocRow = { sessionId: Id<'sessions'>; lat: number; lng: number; accuracyM?: number; recordedAt: number };
export const locationQueue = new PersistentQueue<LocRow>(AsyncStorage, 'safewalk.locationQueue', 20);

async function upload(locs: Location.LocationObject[]) {
  const sessionId = (await AsyncStorage.getItem(ACTIVE_KEY)) as Id<'sessions'> | null;
  if (!sessionId) return;
  for (const l of locs) await locationQueue.push(`${sessionId}:${l.timestamp}`, {
    sessionId, lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, recordedAt: l.timestamp });
  await locationQueue.flush(async (row) => {
    try { await convex.mutation(api.sessions.addLocation, row); }
    catch (e) {
      const code = errorCode(e);
      if (code === 'SESSION_CLOSED') { await AsyncStorage.removeItem(ACTIVE_KEY); return; } // server weigert: niet opnieuw
      if (code === 'BAD_REQUEST') return;
      throw e;
    }
  });
}

// Top-level: draait ook als de app op de achtergrond staat.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (locations?.length) await upload(locations);
});

export const foregroundPermission = async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted';

/** Achtergrondtoestemming wordt pas HIER gevraagd (bij sessiestart). */
export async function startSharing(sessionId: Id<'sessions'>): Promise<{ background: boolean }> {
  if (!(await foregroundPermission())) throw new Error('Locatietoestemming is nodig om je reis te delen.');
  await AsyncStorage.setItem(ACTIVE_KEY, sessionId);
  const bg = (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (now) await upload([now]);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 30_000, deferredUpdatesInterval: 30_000,
    showsBackgroundLocationIndicator: true, pausesUpdatesAutomatically: false, activityType: Location.ActivityType.Fitness,
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
  return l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, locationAt: l.timestamp } : null;
}
