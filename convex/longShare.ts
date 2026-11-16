// Langdurig locatie delen: duurkeuze, serverlimiet (24 uur) en verlengen. Pure regels, geen database.

export const SHARE_MAX_MS = 24 * 3600_000;
/** Server accepteert tot 5 minuten; de app biedt 1 uur als kortste keuze. */
export const SHARE_SERVER_MIN_MS = 5 * 60_000;
/** Toon het verlengscherm als er nog hoogstens een uur rest bij "tot ik stop". */
export const SHARE_RENEW_PROMPT_MS = 60 * 60_000;

export const SHARE_DURATIONS = ['1h', '4h', '8h', '24h', 'until_stop'] as const;
export type ShareDuration = (typeof SHARE_DURATIONS)[number];

export const SHARE_DURATION_LABEL: Record<ShareDuration, string> = {
  '1h': '1 uur',
  '4h': '4 uur',
  '8h': '8 uur',
  '24h': '24 uur',
  until_stop: 'Tot ik stop',
};

const DURATION_MS: Record<Exclude<ShareDuration, 'until_stop'>, number> = {
  '1h': 1 * 3600_000,
  '4h': 4 * 3600_000,
  '8h': 8 * 3600_000,
  '24h': 24 * 3600_000,
};

/** Eindtijd van een deelperiode. "Tot ik stop" krijgt altijd de serverlimiet van 24 uur (daarna verlengen). */
export function shareExpiry(duration: ShareDuration, now: number): { endsAt: number; untilStop: boolean } {
  if (duration === 'until_stop') return { endsAt: now + SHARE_MAX_MS, untilStop: true };
  const ms = DURATION_MS[duration];
  return { endsAt: now + Math.min(Math.max(ms, SHARE_SERVER_MIN_MS), SHARE_MAX_MS), untilStop: false };
}

/** Knipt een gevraagde eindtijd af op de serverlimiet: minstens 1 minuut, hoogstens 24 uur vanaf nu. */
export function clampShareEnd(requestedEnd: number, now: number): number {
  return Math.min(Math.max(requestedEnd, now + 60_000), now + SHARE_MAX_MS);
}

export function isShareDuration(v: unknown): v is ShareDuration {
  return typeof v === 'string' && (SHARE_DURATIONS as readonly string[]).includes(v);
}

/** Verlengprompt alleen bij "tot ik stop", zolang de sessie loopt en er ≤ 1 uur resteert. */
export function shouldPromptRenewal(
  s: { kind?: string; shareUntilStop?: boolean; expectedArrival: number; endedAt?: number; expiresAt?: number },
  now: number,
): boolean {
  if (s.kind !== 'share' || !s.shareUntilStop || s.endedAt !== undefined) return false;
  const end = s.expiresAt ?? s.expectedArrival;
  const remaining = end - now;
  return remaining > 0 && remaining <= SHARE_RENEW_PROMPT_MS;
}

export const SHARE_DEFAULT_LABEL = 'Locatie delen';
export const SHARE_UNTIL_STOP_LABEL = 'Locatie delen (tot ik stop)';
