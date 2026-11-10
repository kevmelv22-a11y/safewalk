/**
 * Veiligheidscode: 4–8 ASCII-tekens, cijfers en letters, hoofdlettergevoelig.
 * Geen trim, geen lowercase. Bestaande cijfercodes blijven dezelfde string en dus dezelfde PBKDF2-hash.
 */
export const SAFETY_CODE_MIN = 4;
export const SAFETY_CODE_MAX = 8;

export const SAFETY_CODE_HINT_NL =
  '4–8 tekens: cijfers en letters. Hoofdletters tellen mee. Geen spaties of leestekens.';

export type SafetyCodeIssue = 'empty' | 'short' | 'long' | 'charset';

export function safetyCodeIssue(code: string): SafetyCodeIssue | null {
  if (typeof code !== 'string' || code.length === 0) return 'empty';
  if (!/^[0-9A-Za-z]+$/.test(code)) return 'charset';
  if (code.length < SAFETY_CODE_MIN) return 'short';
  if (code.length > SAFETY_CODE_MAX) return 'long';
  return null;
}

export function isValidSafetyCode(code: string): boolean {
  return safetyCodeIssue(code) === null;
}
