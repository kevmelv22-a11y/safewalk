// Pure, testbare veiligheidslogica (geen React / native imports).

export const STALE_AFTER_MS = 2 * 60_000;   // > 2 min geen update: waarschuwing
export const LOST_AFTER_MS = 10 * 60_000;   // > 10 min: "geen actuele locatie"

export type Freshness = 'fresh' | 'stale' | 'lost' | 'none';
export function locationFreshness(lastAt: string | number | Date | null | undefined, now = Date.now()): Freshness {
  if (!lastAt) return 'none';
  const age = now - new Date(lastAt).getTime();
  if (age > LOST_AFTER_MS) return 'lost';
  if (age > STALE_AFTER_MS) return 'stale';
  return 'fresh';
}

export function freshnessLabel(f: Freshness): string {
  switch (f) {
    case 'fresh': return 'Locatie actueel';
    case 'stale': return 'Locatie mogelijk verouderd';
    case 'lost': return 'Geen actuele locatie – laatste positie kan onjuist zijn';
    default: return 'Nog geen locatie ontvangen';
  }
}

export function accuracyLabel(m: number | null | undefined): string {
  if (m == null) return 'Nauwkeurigheid onbekend';
  if (m <= 20) return `±${Math.round(m)} m (goed)`;
  if (m <= 100) return `±${Math.round(m)} m (matig)`;
  return `±${Math.round(m)} m (onnauwkeurig)`;
}

export function timeAgo(at: string | number | Date | null | undefined, now = Date.now()): string {
  if (!at) return 'nooit';
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s} s geleden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  return `${Math.floor(m / 60)} u ${m % 60} min geleden`;
}

export type CheckInPhase = 'running' | 'due' | 'grace' | 'overdue';
/** Fase van de check-in o.b.v. door de SERVER opgeslagen due_at en grace_minutes. */
export function checkInPhase(dueAt: string | number | Date, graceMinutes: number, now = Date.now()): CheckInPhase {
  const due = new Date(dueAt).getTime();
  if (now < due - 60_000) return 'running';
  if (now < due) return 'due';
  if (now < due + graceMinutes * 60_000) return 'grace';
  return 'overdue';
}

export function formatCountdown(ms: number): string {
  const neg = ms < 0; const t = Math.abs(Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** Valideert invoer voor een nieuwe sessie. Geeft Nederlandse foutmelding of null. */
export function validateSessionInput(i: { destination: string; arrival: Date; viewerIds: string[] }, now = Date.now()): string | null {
  if (!i.destination.trim()) return 'Vul een bestemming in.';
  if (i.destination.length > 120) return 'Bestemming is te lang.';
  if (i.arrival.getTime() <= now + 60_000) return 'Kies een aankomsttijd in de toekomst.';
  if (i.arrival.getTime() > now + 12 * 3600_000) return 'Een sessie kan maximaal 12 uur duren.';
  if (i.viewerIds.length === 0) return 'Kies minstens één vertrouwd contact.';
  return null;
}

/** Haalt het uitnodigingstoken uit een link (safewalk://invite/<token> of https://.../invite/<token>) of los token. */
export function parseInviteToken(input: string): string | null {
  const m = input.trim().match(/(?:invite\/|token=)?([a-f0-9]{64})\b/i);
  return m ? m[1].toLowerCase() : null;
}

export { haversineMeters, roughEtaMs } from '../../convex/geo';

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
/** ETA-label; bewust geen uitspraak over veiligheid van de route. */
export function etaLabel(etaMs: number): string {
  const min = Math.max(1, Math.round(etaMs / 60_000));
  return min < 60 ? `± ${min} min lopen (hemelsbreed geschat)` : `± ${Math.floor(min / 60)} u ${min % 60} min lopen (hemelsbreed geschat)`;
}
/** Kies een passende verwachte reistijd (min) uit de presets o.b.v. ruwe ETA + marge. */
export function suggestMinutes(etaMs: number, presets = [10, 20, 30, 45, 60, 90]): number {
  const need = etaMs / 60_000 * 1.2 + 3;
  return presets.find((p) => p >= need) ?? presets[presets.length - 1];
}

/** Eerlijke statuslabels: alleen 'verstuurd', 'mislukt' of 'onbekend' – nooit 'gelezen' of 'gegarandeerd'. */
export const deliveryLabel: Record<string, string> = {
  queued: 'Wordt verstuurd…',
  sent: 'Verstuurd (wacht op bevestiging pushdienst)',
  delivered: 'Verstuurd – bevestigd door pushdienst (niet per se gelezen)',
  failed: 'Mislukt',
  no_token: 'Mislukt – contact heeft geen meldingen ingeschakeld',
  unknown: 'Onbekend – geen bevestiging ontvangen',
};
export const deliveryIcon = (s: string) => (s === 'delivered' || s === 'sent' ? '✅' : s === 'queued' ? '⏳' : s === 'unknown' ? '❔' : '❌');
export const notificationKindLabel: Record<string, string> = {
  sos: 'SOS', missed_check_in: 'Check-in gemist', trip_started: 'Reis gestart', almost_arrived: 'Bijna aangekomen',
  check_in_required: 'Check-in vereist', trip_ended: 'Reis beëindigd', motion_check: 'Extra check-in',
};

export function mapErrorNl(msg: string | undefined): string {
  if (!msg) return 'Er ging iets mis.';
  if (msg.includes('CONTACT_LIMIT')) return 'Gratis account: maximaal 2 vertrouwde contacten.';
  if (msg.includes('INVITATION_INVALID')) return 'Deze uitnodiging is ongeldig of verlopen.';
  if (msg.includes('INVITATION_SELF')) return 'Je kunt je eigen uitnodiging niet accepteren.';
  if (msg.includes('VIEWER_NOT_TRUSTED')) return 'Alleen geaccepteerde vertrouwde contacten kunnen meekijken.';
  if (msg.includes('PREMIUM_REQUIRED')) return 'Deze functie is onderdeel van Premium.';
  if (msg.includes('RESTRICTED')) return 'Je account is beperkt. Neem contact op met support. SOS blijft werken.';
  if (msg.includes('RATE_LIMITED')) return 'Te veel verzoeken. Probeer het later opnieuw.';
  if (msg.includes('INVALID_ARRIVAL')) return 'Ongeldige aankomsttijd.';
  if (msg.includes('EXTENSION_NOT_ALLOWED')) return 'Verlengen is niet meer mogelijk.';
  if (msg.includes('EMAIL_NOT_CONFIGURED')) return 'E-mail versturen is nog niet ingesteld op de server. Probeer het later opnieuw of neem contact op met support.';
  if (msg.includes('EMAIL_SEND_FAILED')) return 'De e-mail kon niet worden verstuurd. Probeer het later opnieuw.';
  if (msg.includes('WEAK_PASSWORD')) return 'Gebruik een wachtwoord van minstens 10 tekens.';
  if (/invalid code|could not verify|InvalidAccountId|InvalidSecret/i.test(msg)) return 'De code is onjuist of verlopen.';
  return msg;
}

/** Normaliseert een ingevoerde OTP-code (spaties/streepjes eruit) en controleert 6 cijfers. */
export function normalizeCode(input: string): string | null {
  const c = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(c) ? c : null;
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
