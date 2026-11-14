// Schudden voor SOS: pure detector (testbaar) + prefs. Bewust hoge drempel, zodat lopen/rennen/fietsen niet triggert.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SHAKE_G = 2.7;          // piek in g (zwaartekracht = 1 g)
export const SHAKE_PEAKS = 4;         // zoveel pieken…
export const SHAKE_WINDOW_MS = 1500;  // …binnen dit venster
export const PEAK_GAP_MS = 120;       // één schok telt één keer
export const SHAKE_COOLDOWN_MS = 30_000;
export const SHAKE_INTERVAL_MS = 100; // 10 Hz: zuinig, geen HIGH_SAMPLING_RATE_SENSORS nodig

export type ShakeState = { peaks: number[]; lastTrigger: number };
export const newShakeState = (): ShakeState => ({ peaks: [], lastTrigger: -Infinity });

/** Voert één meting in; true = schudgebaar herkend (en cooldown gestart). */
export function feedShake(st: ShakeState, x: number, y: number, z: number, t: number): boolean {
  const g = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(g)) return false;
  if (t - st.lastTrigger < SHAKE_COOLDOWN_MS) return false;
  if (g >= SHAKE_G) {
    const last = st.peaks[st.peaks.length - 1];
    if (last === undefined || t - last >= PEAK_GAP_MS) st.peaks.push(t);
  }
  while (st.peaks.length && t - st.peaks[0] > SHAKE_WINDOW_MS) st.peaks.shift();
  if (st.peaks.length >= SHAKE_PEAKS) { st.peaks = []; st.lastTrigger = t; return true; }
  return false;
}

const KEY = 'safewalk.shakeSos.v1';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
export async function getShakeOptIn() { return (await AsyncStorage.getItem(KEY)) === '1'; }
export async function setShakeOptIn(on: boolean) {
  if (on) await AsyncStorage.setItem(KEY, '1'); else await AsyncStorage.removeItem(KEY);
  for (const l of listeners) l(on);
}
export function subscribeShakeOptIn(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
