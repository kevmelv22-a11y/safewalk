/**
 * Optionele ritgegevens (taxi/rit delen). Alleen wat de gebruiker zelf typet.
 * Geen scan of kentekenherkenning. Lege velden vallen weg.
 */
export const RIDE_PLATE_MAX = 16;
export const RIDE_NAME_MAX = 80;
export const RIDE_VEHICLE_MAX = 80;

export type RideShare = {
  plate?: string;
  driverName?: string;
  vehicle?: string;
};

export type RideShareInput = {
  plate?: string | null;
  driverName?: string | null;
  vehicle?: string | null;
};

function clean(value: string | null | undefined, max: number, loose = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().replace(/\s+/g, ' ');
  if (!t) return undefined;
  if (t.length > max) return undefined;
  if (!loose && !/^[0-9A-Za-zÀ-öø-ÿ.\- ]+$/.test(t)) return undefined;
  return t;
}

/** Normaliseert en keurt velden goed. Ongeldige invoer → issue, geen stille afkapping van te lange tekst. */
export function parseRideShare(input: RideShareInput): { ok: true; value?: RideShare } | { ok: false; issue: 'plate' | 'driverName' | 'vehicle' } {
  const check = (raw: string | null | undefined, max: number, issue: 'plate' | 'driverName' | 'vehicle', loose?: boolean) => {
    if (raw == null || !String(raw).trim()) return undefined;
    const v = clean(raw, max, loose);
    if (!v) return issue;
    return v;
  };
  const plate = check(input.plate, RIDE_PLATE_MAX, 'plate');
  if (plate === 'plate') return { ok: false, issue: 'plate' };
  const driverName = check(input.driverName, RIDE_NAME_MAX, 'driverName', true);
  if (driverName === 'driverName') return { ok: false, issue: 'driverName' };
  const vehicle = check(input.vehicle, RIDE_VEHICLE_MAX, 'vehicle', true);
  if (vehicle === 'vehicle') return { ok: false, issue: 'vehicle' };
  const value: RideShare = {};
  if (typeof plate === 'string') value.plate = plate.toUpperCase();
  if (typeof driverName === 'string') value.driverName = driverName;
  if (typeof vehicle === 'string') value.vehicle = vehicle;
  return Object.keys(value).length ? { ok: true, value } : { ok: true };
}

export function rideShareLine(r?: RideShare | null): string {
  if (!r) return '';
  const parts: string[] = [];
  if (r.plate) parts.push(`kenteken ${r.plate}`);
  if (r.driverName) parts.push(`chauffeur ${r.driverName}`);
  if (r.vehicle) parts.push(r.vehicle);
  return parts.length ? `Rit: ${parts.join(' · ')}.` : '';
}

export const RIDE_SHARE_HINT_NL =
  'Optioneel. Alleen delen met de kijkers die jij kiest, tot de reis eindigt. De chauffeur heeft hier geen toestemming voor gegeven; deel alleen wat nodig is.';

export const RIDE_SHARE_ISSUE_NL: Record<'plate' | 'driverName' | 'vehicle', string> = {
  plate: 'Kenteken: maximaal 16 tekens, letters, cijfers, streepjes of spaties.',
  driverName: 'Naam chauffeur: maximaal 80 tekens.',
  vehicle: 'Voertuig: maximaal 80 tekens (kleur, merk of type).',
};
