// Live meekijken 2.0: pure regels (geen database), gedeeld door server, app en tests.

export const MAX_LINK_MS = 24 * 3600_000;
export const MIN_LINK_MS = 5 * 60_000;
export type LinkDuration = '15m' | '1h' | 'arrival' | '8h';
export const LINK_DURATIONS: LinkDuration[] = ['15m', '1h', 'arrival', '8h'];
export const LINK_DURATION_LABEL: Record<LinkDuration, string> = {
  '15m': '15 min', '1h': '1 uur', arrival: 'Tot aankomst', '8h': '8 uur',
};

/**
 * Vervaltijd van een link. 'arrival' volgt het einde van de reis (sessionExpiresAt); zonder reis 2 uur.
 * Altijd tussen 5 min en 24 uur vanaf nu.
 */
export function linkExpiry(duration: LinkDuration, now: number, sessionExpiresAt?: number): number {
  const ms = duration === '15m' ? 15 * 60_000 : duration === '1h' ? 3600_000 : duration === '8h' ? 8 * 3600_000
    : (sessionExpiresAt !== undefined ? sessionExpiresAt - now : 2 * 3600_000);
  return now + Math.min(Math.max(ms, MIN_LINK_MS), MAX_LINK_MS);
}

/** Toegangscode: precies 6 cijfers (makkelijk door te geven aan de telefoon). */
export const ACCESS_CODE_RE = /^\d{6}$/;
export const CODE_ATTEMPTS_PER_WINDOW = 5;
export const CODE_WINDOW_MS = 15 * 60_000;
/** Na zoveel foute pogingen in totaal is de link definitief op slot; maak dan een nieuwe. */
export const CODE_MAX_FAILURES = 20;

export function normalizeAccessCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const c = input.replace(/[\s-]/g, '');
  return ACCESS_CODE_RE.test(c) ? c : null;
}

/**
 * Privacy-check-in: kijkers zien tijdens de reis alleen de status. Locatie, batterij en route worden pas
 * zichtbaar bij een gemiste check-in (status 'alert' of check-in 'missed') of een SOS tijdens de reis.
 */
export function revealDetails(s: { privacyMode?: boolean; status: string; sosAt?: number }, checkInStatus?: string | null): boolean {
  if (!s.privacyMode) return true;
  return s.status === 'alert' || checkInStatus === 'missed' || s.sosAt !== undefined;
}

export const LOW_BATTERY_PCT = 15;
/** Zonder nieuw punt na zoveel tijd: "niet meer live" naar kijkers. */
export const NOT_LIVE_AFTER_MS = 10 * 60_000;
export const MAX_NOT_LIVE_SIGNALS = 3;

export function shouldSignalLowBattery(s: { lowBatteryAt?: number; privacyMode?: boolean }, pct: number | undefined): boolean {
  return pct !== undefined && pct <= LOW_BATTERY_PCT && s.lowBatteryAt === undefined && !s.privacyMode;
}

export function shouldSignalNotLive(s: { lastSeenAt?: number; notLiveAt?: number; notLiveCount?: number }, now: number): boolean {
  if (s.lastSeenAt === undefined || s.notLiveAt !== undefined) return false;
  if ((s.notLiveCount ?? 0) >= MAX_NOT_LIVE_SIGNALS) return false;
  return now - s.lastSeenAt > NOT_LIVE_AFTER_MS;
}

/** Recente route voor de kaart: hooguit `max` punten, gelijkmatig uitgedund, laatste punt altijd erbij. */
export function thinTrail<T>(points: T[], max = 120): T[] {
  if (points.length <= max) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** "Navigeer naar mij": Google Maps (Android/web) en Apple Kaarten (iPhone). Alleen geldige coördinaten. */
export function navigationLinks(lat: number, lng: number): { google: string; apple: string } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=w`,
  };
}

// ───────── E-mailmeldingen voor kijkers zonder app ─────────
export type ViewerEvent = 'sos' | 'sos_cancelled' | 'missed' | 'arrived' | 'ended' | 'low_battery' | 'not_live';
export const MAX_SUBSCRIBERS_PER_LINK = 5;
export const MAX_EMAILS_PER_SUBSCRIPTION = 12;
/** Resend gratis: 100 per dag. Ruim eronder blijven, ook voor verificatiemails van accounts. */
export const DAILY_VIEWER_EMAIL_CAP = 80;
export const CONFIRM_TTL_MS = 24 * 3600_000;

export const isEmail = (e: unknown): e is string =>
  typeof e === 'string' && e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(e.trim());

const hhmm = (t: number) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

export type EventDetails = {
  what: string; // "Reis naar Thuis" / "Timer: Date"
  at: number;
  lat?: number; lng?: number; locationAt?: number;
  batteryPct?: number;
  ride?: string; // al geformatteerde ritregel, optioneel
};

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Onderwerp + tekst per gebeurtenis. Geen naam (de meekijkpagina toont ook geen naam), geen 112-belofte. */
export function viewerEmail(ev: ViewerEvent, d: EventDetails, unsubUrl: string): { subject: string; text: string; html: string } {
  const loc = d.lat !== undefined && d.lng !== undefined
    ? `Laatst bekende locatie${d.locationAt ? ` (${hhmm(d.locationAt)})` : ''}: https://maps.google.com/?q=${d.lat.toFixed(6)},${d.lng.toFixed(6)}` : 'Er is geen recente locatie bekend.';
  const batt = typeof d.batteryPct === 'number' ? ` Batterij: ${d.batteryPct}%.` : '';
  const ride = d.ride ? ` ${d.ride}` : '';
  const urgent = 'Probeer direct contact op te nemen. Bij direct gevaar: bel 112. SafeWalk belt zelf geen 112.';
  const m: Record<ViewerEvent, [string, string]> = {
    sos: ['🆘 SOS via SafeWalk', `De persoon die deze SafeWalk-meekijklink met je deelde, heeft om ${hhmm(d.at)} SOS geactiveerd (${d.what}). ${loc}${batt}${ride} ${urgent}`],
    sos_cancelled: ['✅ SOS ingetrokken', `De SOS van ${hhmm(d.at)} is ingetrokken: volgens de gebruiker is alles goed (${d.what}).`],
    missed: ['⚠️ Check-in gemist via SafeWalk', `Er is niet op tijd bevestigd dat alles goed is (${d.what}, ${hhmm(d.at)}). ${loc}${batt}${ride} ${urgent}`],
    arrived: ['✅ Veilig aangekomen', `Om ${hhmm(d.at)} is bevestigd: veilig aangekomen (${d.what}). De locatie wordt niet meer gedeeld. Je krijgt voor deze link geen e-mails meer.`],
    ended: ['Delen gestopt', `Het delen is om ${hhmm(d.at)} gestopt of verlopen (${d.what}), zonder bevestiging van aankomst. Twijfel je? Neem zelf contact op. Je krijgt voor deze link geen e-mails meer.`],
    low_battery: ['🔋 Batterij bijna leeg', `De telefoon meldde om ${hhmm(d.at)} een batterij van ${d.batteryPct ?? '?'}% (${d.what}). Valt de telefoon straks uit, dan stopt de live locatie.`],
    not_live: ['📡 Niet meer live', `Sinds ${hhmm(d.at)} komt er geen nieuwe locatie meer binnen (${d.what}). Dat kan door geen bereik, een lege batterij of een uitgezette telefoon. Twijfel je? Neem contact op.`],
  };
  const [subject, body] = m[ev];
  const footer = `Je krijgt deze e-mail omdat je je hiervoor hebt aangemeld op een SafeWalk-meekijkpagina. Afmelden: ${unsubUrl}`;
  const text = `${body}\n\n${footer}\n\n– SafeWalk (Vonk Byte)`;
  const html = `<p>${escHtml(body).replace(/https:\/\/maps\.google\.com\/\?q=[0-9.,-]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`
    + `<p style="color:#64748b;font-size:13px">Je krijgt deze e-mail omdat je je hiervoor hebt aangemeld op een SafeWalk-meekijkpagina. <a href="${escHtml(unsubUrl)}">Afmelden</a></p><p>– SafeWalk (Vonk Byte)</p>`;
  return { subject, text, html };
}

/** Bewust zonder reisdetails: het adres is nog niet bevestigd en kan van iemand anders zijn. */
export function confirmEmail(confirmUrl: string): { subject: string; text: string; html: string } {
  const body = `Iemand (hopelijk jij) wil e-mails ontvangen over een SafeWalk-meekijklink: bij SOS, een gemiste check-in, aankomst, een bijna lege batterij of als de locatie niet meer live is.`;
  const text = `${body}\n\nBevestig hier (24 uur geldig): ${confirmUrl}\n\nNiet aangevraagd? Negeer deze e-mail; je krijgt dan niets.\n\n– SafeWalk (Vonk Byte)`;
  const html = `<p>${escHtml(body)}</p><p><a href="${escHtml(confirmUrl)}" style="display:inline-block;background:#7856ff;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">Meldingen bevestigen</a></p><p style="color:#64748b;font-size:13px">24 uur geldig. Niet aangevraagd? Negeer deze e-mail; je krijgt dan niets.</p><p>– SafeWalk (Vonk Byte)</p>`;
  return { subject: 'Bevestig SafeWalk-meldingen', text, html };
}

/** Wat de reis heet in teksten: "Reis naar Thuis" of "Timer: Date". */
export const sessionWhat = (s: { kind?: string; destinationLabel: string }) =>
  s.kind === 'timer' ? `Timer: ${s.destinationLabel}` : `Reis naar ${s.destinationLabel}`;
