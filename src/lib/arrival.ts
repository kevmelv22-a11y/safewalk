import { haversineMeters } from '../../convex/geo';

/** "Ben je er?" verschijnt binnen ~100 m van de bestemming, alleen terwijl de app open is (geen achtergrondlocatie). */
export const ARRIVAL_PROMPT_M = 100;
/** Punt mag niet ouder zijn dan 2 minuten en niet onnauwkeuriger dan 75 m. */
export const ARRIVAL_MAX_AGE_MS = 2 * 60_000;
export const ARRIVAL_MAX_ACCURACY_M = 75;
/** Na "Nog niet" pas na 5 minuten opnieuw vragen. */
export const ARRIVAL_SNOOZE_MS = 5 * 60_000;

type Pt = { lat: number; lng: number; accuracyM?: number | null; recordedAt: number };

export function arrivalDistance(last: Pt | null | undefined, dest: { lat: number; lng: number } | null | undefined): number | null {
  if (!last || !dest) return null;
  return haversineMeters(last, dest);
}

export function shouldAskArrived(o: {
  last: Pt | null | undefined;
  dest: { lat: number; lng: number } | null | undefined;
  now: number;
  snoozedAt: number | null;
  active: boolean;
}): boolean {
  if (!o.active || !o.last || !o.dest) return false;
  if (o.now - o.last.recordedAt > ARRIVAL_MAX_AGE_MS) return false;
  if (o.last.accuracyM != null && o.last.accuracyM > ARRIVAL_MAX_ACCURACY_M) return false;
  if (o.snoozedAt !== null && o.now - o.snoozedAt < ARRIVAL_SNOOZE_MS) return false;
  const d = arrivalDistance(o.last, o.dest);
  return d !== null && d <= ARRIVAL_PROMPT_M;
}
