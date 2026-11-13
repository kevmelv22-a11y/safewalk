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
let watchSessionId: Id<'sessions'> | null = null;

type SharingListener = (sessionId: Id<'sessions'> | null) => void;
const listeners = new Set<SharingListener>();
const emit = () => { for (const l of listeners) l(watchSessionId); };

/** Voor welke reis deelt deze app nu echt locatie (actieve watcher)? null = niet. */
export const sharingSessionId = () => watchSessionId;
export function subscribeSharing(l: SharingListener) { listeners.add(l); return () => { listeners.delete(l); }; }

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
  await serial(async () => {
    if (watchSub && watchSessionId === sessionId) return;
    await beginWatchNow(sessionId);
  });
}

// Starten/stoppen loopt strikt na elkaar, zodat er nooit twee watchers tegelijk lekken.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

async function beginWatchNow(sessionId: Id<'sessions'>) {
  await stopWatchNow();
  await AsyncStorage.setItem(ACTIVE_KEY, sessionId);
  // Eerste punt meteen; zonder GPS-fix binnen 15 s gaat de watcher gewoon door.
  const now = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), 15_000);
  if (now) await upload([now]).catch(() => {}); // offline: blijft in de wachtrij
  watchSub = await Location.watchPositionAsync(
    // distanceInterval 0: ook stilstaand elke ~30 s een punt (Android), zodat meekijkers niet ten onrechte "verouderd" zien.
    { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 30_000 },
    (l) => { void upload([l]).catch(() => {}); },
  );
  watchSessionId = sessionId;
  emit();
}

export type ResumeResult = 'already' | 'resumed' | 'no_permission' | 'failed';

/**
 * Hervat delen voor een nog lopende reis nadat de app opnieuw is gestart (de watcher leeft
 * alleen in het geheugen). Vraagt NIET opnieuw om toestemming: alleen als die al gegeven is.
 */
export async function ensureSharing(sessionId: Id<'sessions'>): Promise<ResumeResult> {
  try {
    return await serial(async () => {
      if (watchSub && watchSessionId === sessionId) return 'already' as const;
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return 'no_permission' as const;
      await beginWatchNow(sessionId);
      return 'resumed' as const;
    });
  } catch {
    return 'failed';
  }
}

async function stopWatchNow() {
  if (watchSub) {
    watchSub.remove();
    watchSub = null;
  }
  if (watchSessionId !== null) { watchSessionId = null; emit(); }
}

export function stopSharing() {
  return serial(async () => {
    await AsyncStorage.removeItem(ACTIVE_KEY);
    await stopWatchNow();
  });
}

export async function lastKnown() {
  const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}).catch(() => null));
  return l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, locationAt: l.timestamp } : null;
}
