import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import { Platform } from 'react-native';
import { convex, errorCode } from './convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { PersistentQueue } from './queue';

const ACTIVE_KEY = 'safewalk.activeSession';
/** Harde bovengrens (ms sinds epoch): ook als de app/server niets meer zegt, stopt de achtergrondtaak daarna zelf. */
const UNTIL_KEY = 'safewalk.activeSessionUntil';
export const TRIP_LOCATION_TASK = 'safewalk-trip-location';
/** Max. 1 upload per 25 s vanuit de achtergrond (iOS levert soms elke seconde): batterij en rate-limit sparen. */
export const MIN_UPLOAD_GAP_MS = 25_000;
const HARD_CAP_MS = 24 * 3600_000;

/** 'background' = ook met scherm uit/app op de achtergrond (Android: zichtbare melding). 'foreground' = alleen met app open. */
export type SharingMode = 'background' | 'foreground' | null;
let mode: SharingMode = null;
export const sharingMode = () => mode;
type LocRow = { sessionId: Id<'sessions'>; lat: number; lng: number; accuracyM?: number; recordedAt: number; batteryPct?: number };
export const locationQueue = new PersistentQueue<LocRow>(AsyncStorage, 'safewalk.locationQueue', 20);

let watchSub: Location.LocationSubscription | null = null;
let watchSessionId: Id<'sessions'> | null = null;

type SharingListener = (sessionId: Id<'sessions'> | null) => void;
const listeners = new Set<SharingListener>();
const emit = () => { for (const l of listeners) l(watchSessionId); };

/** Voor welke reis deelt deze app nu echt locatie (actieve watcher)? null = niet. */
export const sharingSessionId = () => watchSessionId;
export function subscribeSharing(l: SharingListener) { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * Batterijpercentage (0–100) om mee te sturen tijdens een actieve reis, zodat contacten bij een gemiste check-in
 * kunnen zien of de telefoon misschien leeg was. Onbekend (web/emulator: -1) → niet meesturen.
 */
export async function readBatteryPct(): Promise<number | undefined> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 && level <= 1 ? Math.round(level * 100) : undefined;
  } catch { return undefined; }
}

/** Oudere server zonder nieuwe velden: punt opnieuw sturen met alleen de basisvelden (nooit blijven hangen). */
const isArgError = (e: unknown) => /ArgumentValidationError|extra field|batteryPct/i.test(String((e as Error)?.message ?? e));

async function upload(locs: Location.LocationObject[]) {
  const sessionId = (await AsyncStorage.getItem(ACTIVE_KEY)) as Id<'sessions'> | null;
  if (!sessionId) return;
  const batteryPct = await readBatteryPct();
  for (const l of locs) await locationQueue.push(`${sessionId}:${l.timestamp}`, {
    sessionId, lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, recordedAt: l.timestamp,
    ...(batteryPct !== undefined ? { batteryPct } : {}) });
  await locationQueue.flush(async (row) => {
    try {
      try { await convex.mutation(api.sessions.addLocation, row); }
      catch (e) {
        // Oudere server zonder batterijveld: niet blijven hangen, punt zonder batterij opnieuw sturen.
        if (row.batteryPct === undefined || !isArgError(e)) throw e;
        const { batteryPct: _drop, ...rest } = row; void _drop;
        await convex.mutation(api.sessions.addLocation, rest);
      }
    }
    catch (e) {
      const code = errorCode(e);
      if (code === 'SESSION_CLOSED') { await AsyncStorage.removeItem(ACTIVE_KEY); await stopBackgroundUpdates(); return; } // server weigert: niet opnieuw, en achtergrondtaak stoppen
      if (code === 'BAD_REQUEST') return;
      throw e;
    }
  });
}

export const foregroundPermission = async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted';

// ───────── Achtergrond: alleen tijdens een zelf gestarte reis ─────────
let lastUploadAt = 0;
/** Pure keuze (testbaar): welke punten uit een achtergrondbatch uploaden we? Alleen het nieuwste, en niet te vaak. */
export function pickBackgroundPoint(locs: Location.LocationObject[], lastAt: number, gapMs = MIN_UPLOAD_GAP_MS): Location.LocationObject | null {
  if (!locs.length) return null;
  const latest = locs.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  return latest.timestamp - lastAt >= gapMs ? latest : null;
}

/** Wordt aangeroepen door de achtergrondtaak. Stopt de taak zelf als er geen reis meer is of de bovengrens voorbij is. */
export async function handleBackgroundLocations(locs: Location.LocationObject[], now = Date.now()) {
  const sessionId = await AsyncStorage.getItem(ACTIVE_KEY);
  const until = Number((await AsyncStorage.getItem(UNTIL_KEY)) ?? 0);
  if (!sessionId || !until || now > until) { await stopBackgroundUpdates(); return 'stopped' as const; }
  const pick = pickBackgroundPoint(locs, lastUploadAt);
  if (!pick) return 'skipped' as const;
  lastUploadAt = pick.timestamp;
  await upload([pick]).catch(() => {}); // offline: blijft in de wachtrij
  return 'uploaded' as const;
}

try {
  // Taak moet bij het laden van de bundel gedefinieerd zijn (ook als Android de app op de achtergrond start).
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    await handleBackgroundLocations(data.locations);
  });
} catch { /* web/test: geen TaskManager; dan alleen delen met app open */ }

async function backgroundRunning() {
  try { return await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK); } catch { return false; }
}

export async function stopBackgroundUpdates() {
  try { if (await backgroundRunning()) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK); } catch { /* al gestopt */ }
}

/** Tekst van de vaste Android-melding zolang er gedeeld wordt. */
export const FOREGROUND_NOTIFICATION = {
  notificationTitle: 'SafeWalk deelt je locatie',
  notificationBody: 'Alleen tijdens deze reis, tot je stopt of je aankomst bevestigt. Tik om SafeWalk te openen.',
  notificationColor: '#7856FF',
};

/** Opties voor startLocationUpdatesAsync (gedeeld met tests): 30 s, ook stilstaand, met zichtbare melding/indicator. */
export const BACKGROUND_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy?.High,
  timeInterval: 30_000,
  distanceInterval: 0,
  deferredUpdatesInterval: 30_000,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType?.Fitness,
  showsBackgroundLocationIndicator: true,
  // Weggeveegd = gestopt: dan zien kijkers eerlijk "niet meer live" in plaats van een stille, niet-ingelogde taak.
  foregroundService: { ...FOREGROUND_NOTIFICATION, killServiceOnDestroy: true },
};

/**
 * Probeert delen met scherm uit/app op de achtergrond (Android: voorgronddienst met melding, geen
 * ACCESS_BACKGROUND_LOCATION; iOS: "tijdens gebruik" + blauwe indicator). Lukt dat niet (web, oude build,
 * Expo Go), dan valt de app terug op delen terwijl SafeWalk open is.
 */
async function startBackgroundUpdates(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (typeof Location.startLocationUpdatesAsync !== 'function') return false;
    if (TaskManager.isAvailableAsync && !(await TaskManager.isAvailableAsync())) return false;
    await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, BACKGROUND_OPTIONS);
    return true;
  } catch { return false; }
}

/** Locatie delen tijdens de reis: op de achtergrond waar mogelijk, anders alleen met de app open. */
export async function startSharing(sessionId: Id<'sessions'>, opts: { until?: number } = {}): Promise<void> {
  if (!(await foregroundPermission())) throw new Error('Locatietoestemming is nodig om je reis te delen.');
  await serial(async () => {
    if ((watchSub || mode === 'background') && watchSessionId === sessionId) return;
    await beginWatchNow(sessionId, opts.until);
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

async function beginWatchNow(sessionId: Id<'sessions'>, until?: number) {
  await stopWatchNow();
  await AsyncStorage.setItem(ACTIVE_KEY, sessionId);
  await AsyncStorage.setItem(UNTIL_KEY, String(Math.min(until ?? Date.now() + HARD_CAP_MS, Date.now() + HARD_CAP_MS)));
  // Eerste punt meteen; zonder GPS-fix binnen 15 s gaat het delen gewoon door.
  const now = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), 15_000);
  if (now) { lastUploadAt = now.timestamp; await upload([now]).catch(() => {}); } // offline: blijft in de wachtrij
  if (await startBackgroundUpdates()) {
    mode = 'background';
  } else {
    watchSub = await Location.watchPositionAsync(
      // distanceInterval 0: ook stilstaand elke ~30 s een punt (Android), zodat meekijkers niet ten onrechte "verouderd" zien.
      { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 30_000 },
      (l) => { void upload([l]).catch(() => {}); },
    );
    mode = 'foreground';
  }
  watchSessionId = sessionId;
  emit();
}

export type ResumeResult = 'already' | 'resumed' | 'no_permission' | 'failed';

/**
 * Hervat delen voor een nog lopende reis nadat de app opnieuw is gestart (de watcher leeft
 * alleen in het geheugen). Vraagt NIET opnieuw om toestemming: alleen als die al gegeven is.
 */
export async function ensureSharing(sessionId: Id<'sessions'>, until?: number): Promise<ResumeResult> {
  try {
    return await serial(async () => {
      if ((watchSub || mode === 'background') && watchSessionId === sessionId) return 'already' as const;
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return 'no_permission' as const;
      await beginWatchNow(sessionId, until);
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
  await stopBackgroundUpdates();
  mode = null;
  if (watchSessionId !== null) { watchSessionId = null; emit(); }
}

/** Stopt álles (watcher én achtergrondtaak) en wist de lokale reis. Veilig om vaker aan te roepen. */
export function stopSharing() {
  return serial(async () => {
    await AsyncStorage.removeItem(ACTIVE_KEY);
    await AsyncStorage.removeItem(UNTIL_KEY);
    await stopWatchNow();
  });
}

/** Reis verlengd: de eigen stopgrens van de achtergrondtaak schuift mee (nooit verder dan 24 u vanaf nu). */
export async function updateSharingUntil(sessionId: Id<'sessions'>, until: number) {
  if ((await AsyncStorage.getItem(ACTIVE_KEY)) !== sessionId) return;
  await AsyncStorage.setItem(UNTIL_KEY, String(Math.min(until, Date.now() + HARD_CAP_MS)));
}

/** Server zet een reis op expiresAt; 5 min speling voor klokverschil. */
export const untilFor = (expiresAt: number) => expiresAt + 5 * 60_000;

/**
 * Na een herstart kan een achtergrondtaak nog geregistreerd staan terwijl de server geen open reis meer heeft
 * (bv. elders beëindigd of verlopen). Dan stoppen we hem hier.
 */
export async function stopOrphanedBackground() {
  if (watchSessionId === null && (await backgroundRunning())) await stopSharing();
}

export async function lastKnown() {
  const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}).catch(() => null));
  return l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? undefined, locationAt: l.timestamp } : null;
}
