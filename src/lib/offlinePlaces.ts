// Laatste Overpass-resultaten lokaal bewaren, zodat je ze zonder netwerk nog kunt zien.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NearbyPlace } from './safePlaces';

const KEY = 'safewalk.offlinePlaces.v1';
const MAX_AGE_MS = 24 * 3600_000;

export type PlacesCache = {
  lat: number;
  lng: number;
  savedAt: number;
  places: NearbyPlace[];
};

export async function savePlacesCache(c: PlacesCache): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(c));
}

export async function loadPlacesCache(now = Date.now()): Promise<PlacesCache | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as PlacesCache;
    if (!c || !Array.isArray(c.places) || !Number.isFinite(c.savedAt)) return null;
    if (now - c.savedAt > MAX_AGE_MS) return null;
    return c;
  } catch { return null; }
}

export const PLACES_CACHE_HINT =
  'Dit is de laatst opgehaalde lijst, bewaard op dit toestel. De plekken zijn niet live bijgewerkt. SafeWalk stuurt deze cache niet naar de server.';
