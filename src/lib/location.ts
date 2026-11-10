import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { convex, errorCode } from './convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { PersistentQueue } from './queue';

const ACTIVE_KEY = 'safewalk.activeSession';
type LocRow = { sessionId: Id<'sessions'>; lat: number; lng: number; accuracyM?: number; recordedAt: number };
export const locationQueue = new PersistentQueue<LocRow>(AsyncStorage, 'safewalk.locationQueue', 20);

let watchSub: Location.LocationSubscription | null = null;

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

export const foregroundPermission = async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted';

/** Locatie delen werkt alleen terwijl de app open is (geen achtergrondtoestemming). */
export async function startSharing(sessionId: Id<'sessions'>): Promise<void> {
  if (!(await foregroundPermission())) throw new Error('Locatietoestemming is nodig om je reis te delen.');
  await stopWatch();
  await AsyncStorage.setItem(ACTIVE_KEY, sessionId);
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (now) await upload([now]);
  watchSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 30_000 },
    (l) => { void upload([l]); },
  );
}

async function stopWatch() {
  if (watchSub) {
    watchSub.remove();
    watchSub = null;
  }
}

export async function stopSharing() {
  await AsyncStorage.removeItem(ACTIVE_KEY);
  await stopWatch();
}

export async function lastKnown() {
  const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}).catch(() => null));
  return l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, locationAt: l.timestamp } : null;
}
