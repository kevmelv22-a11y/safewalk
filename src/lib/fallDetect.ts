// Valdetectie: een scherpe versnellingspiek gevolgd door stilte. Uit standaard. Alleen op het toestel.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FALL_IMPACT_G = 3.8;
export const FALL_STILL_LO = 0.7;
export const FALL_STILL_HI = 1.3;
export const FALL_STILL_MS = 800;
export const FALL_WINDOW_MS = 2_500;
export const FALL_COOLDOWN_MS = 60_000;

export type FallState = { impactAt: number | null; stillSince: number | null; lastTrigger: number };

export const newFallState = (): FallState => ({ impactAt: null, stillSince: null, lastTrigger: -Infinity });

function mag(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Voert één meting in (in g). true = mogelijke val herkend en cooldown gestart. */
export function feedFall(st: FallState, x: number, y: number, z: number, t: number): boolean {
  const g = mag(x, y, z);
  if (!Number.isFinite(g)) return false;
  if (t - st.lastTrigger < FALL_COOLDOWN_MS) return false;
  if (g >= FALL_IMPACT_G) {
    st.impactAt = t;
    st.stillSince = null;
    return false;
  }
  if (st.impactAt === null || t - st.impactAt > FALL_WINDOW_MS) {
    st.impactAt = null;
    st.stillSince = null;
    return false;
  }
  const still = g >= FALL_STILL_LO && g <= FALL_STILL_HI;
  if (!still) { st.stillSince = null; return false; }
  if (st.stillSince === null) st.stillSince = t;
  if (t - st.stillSince >= FALL_STILL_MS) {
    st.impactAt = null;
    st.stillSince = null;
    st.lastTrigger = t;
    return true;
  }
  return false;
}

const KEY = 'safewalk.fallDetect.v1';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
export async function getFallOptIn() { return (await AsyncStorage.getItem(KEY)) === '1'; }
export async function setFallOptIn(on: boolean) {
  if (on) await AsyncStorage.setItem(KEY, '1'); else await AsyncStorage.removeItem(KEY);
  for (const l of listeners) l(on);
}
export function subscribeFallOptIn(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
