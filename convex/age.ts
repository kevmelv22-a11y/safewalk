/** Geboortejaar + maand. Geen dag, geen ID. Eigen verklaring, geen identiteitscontrole. */
export const MIN_USE_AGE = 13;
export const ADULT_AGE = 16;

export type AgeStatus = 'unknown' | 'under13' | 'minor' | 'adult';

export function ageInYears(year: number, month: number, now = Date.now()): number {
  const d = new Date(now);
  let age = d.getUTCFullYear() - year;
  if (d.getUTCMonth() + 1 < month) age -= 1;
  return age;
}

export function ageStatus(year?: number, month?: number, now = Date.now()): AgeStatus {
  if (year === undefined || month === undefined) return 'unknown';
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 'unknown';
  const age = ageInYears(year, month, now);
  if (age < MIN_USE_AGE) return 'under13';
  if (age < ADULT_AGE) return 'minor';
  return 'adult';
}

/** True when the new year/month claims an earlier birth (more access) than the stored one. */
export function isEarlierBirth(prevYear: number, prevMonth: number, nextYear: number, nextMonth: number): boolean {
  if (nextYear < prevYear) return true;
  if (nextYear === prevYear && nextMonth < prevMonth) return true;
  return false;
}
