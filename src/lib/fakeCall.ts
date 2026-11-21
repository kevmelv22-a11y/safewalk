/**
 * Nep-oproep: een realistisch inkomend gesprek om uit een vervelende situatie te komen.
 * Pure logica (geen native imports), zodat het goed te testen is.
 *
 * Gratis (ook 13–15): meteen laten bellen door een standaardnaam.
 * Premium (16+): later laten bellen (10 seconden, 1 minuut of 5 minuten), een eigen naam en een stem in het gesprek.
 * Een nummer is alleen tekst op het scherm. Er wordt nooit gebeld.
 */
export const FREE_CALLERS = ['Mama', 'Papa', 'Huisgenoot'] as const;
export const DEFAULT_CALLER = FREE_CALLERS[0];
export const MAX_CALLER_LENGTH = 30;
export const MAX_NUMBER_LENGTH = 20;
/** Nu is gratis. De andere vertragingen zijn inplannen (Premium). */
export const FAKE_CALL_DELAYS = [
  { id: 'now', ms: 0, label: 'Nu' },
  { id: '10s', ms: 10_000, label: 'Over 10 seconden' },
  { id: '1m', ms: 60_000, label: 'Over 1 minuut' },
  { id: '5m', ms: 5 * 60_000, label: 'Over 5 minuten' },
] as const;
export type FakeCallDelayId = (typeof FAKE_CALL_DELAYS)[number]['id'];

export const FAKE_CALL_CHANNEL = 'fake-call';
/** Android raw-resource-naam (kleine letters + underscore) van de beltoon in assets/sounds. */
export const FAKE_CALL_SOUND = 'fake_ringtone.wav';
export const FAKE_CALL_NOTIFICATION_ID = 'safewalk-fake-call';

export type FakeCallFeature = 'now' | 'schedule' | 'custom_name' | 'voice';

/** Welke onderdelen mag deze gebruiker? Premium bestaat alleen voor 16+ (aankopen zijn dicht onder 16). */
export function fakeCallAllowed(feature: FakeCallFeature, premium: boolean): boolean {
  return feature === 'now' ? true : premium;
}

/** Naam op het belscherm: ingekort, zonder rare tekens of regeleinden; leeg → standaardnaam. */
export function sanitizeCallerName(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CALLER_LENGTH)
    .trim();
  return cleaned || DEFAULT_CALLER;
}

/** Kies de naam die echt gebruikt mag worden: zonder Premium alleen een van de vaste namen. */
export function effectiveCaller(requested: string | null | undefined, premium: boolean): string {
  const name = sanitizeCallerName(requested);
  if (premium) return name;
  return (FREE_CALLERS as readonly string[]).includes(name) ? name : DEFAULT_CALLER;
}

export function fakeCallDelayMs(id: string): number | null {
  const row = FAKE_CALL_DELAYS.find((d) => d.id === id);
  return row ? row.ms : null;
}

/** Elke vertraging boven 0 is inplannen en blijft Premium (dus pas vanaf 16, want aankopen zijn dan dicht). */
export function delayNeedsPremium(ms: number): boolean {
  return ms > 0;
}

const BLOCKED_NUMBERS = new Set(['112', '911', '09008844', '08002000']);

/** Leeg is toegestaan. Hulpdienstnummers en te korte invoer geven een fouttekst. */
export function callerNumberIssue(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (BLOCKED_NUMBERS.has(digits)) return 'Dit nummer wordt niet op het scherm gezet. SafeWalk belt geen hulpdiensten.';
  if (digits.length < 3) return 'Gebruik minstens 3 cijfers, of laat het nummer leeg.';
  if (digits.length > 15) return 'Dit nummer is te lang.';
  return null;
}

/** Alleen cijfers, plus, spaties en streepjes. Ongeldig of geblokkeerd wordt leeg. */
export function sanitizeCallerNumber(raw: string | null | undefined): string {
  if (callerNumberIssue(raw)) return '';
  const cleaned = String(raw ?? '').replace(/[^\d+\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NUMBER_LENGTH).trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 3 || BLOCKED_NUMBERS.has(digits)) return '';
  return cleaned;
}

/** Tekst die de telefoonstem (Premium) voorleest, met pauzes zodat jij ertussen kunt "praten". */
export const VOICE_LINES = [
  'Hoi, met mij. Waar ben je nu?',
  'Oké. Ik kom je zo ophalen. Blijf maar even waar je bent.',
  'Ik ben er over een paar minuten. Bel me meteen als er iets is.',
  'Ja, prima. Tot zo!',
] as const;
export const VOICE_PAUSE_MS = 4_000;

/** Gesprekstimer op het belscherm, bv. 0:07 of 12:30. */
export function formatCallDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type FakeCallParams = { caller: string; voice: '1' | '0'; number: string };

/** Inhoud van de lokale melding voor een ingeplande nep-oproep. Het nummer wordt niet gebeld. */
export function fakeCallNotification(caller: string, voice: boolean, number = '') {
  const safeNumber = sanitizeCallerNumber(number);
  return {
    title: caller,
    body: safeNumber ? `Inkomende oproep · ${safeNumber}` : 'Inkomende oproep · tik om op te nemen',
    data: { type: 'fake_call' as const, caller, voice: voice ? '1' as const : '0' as const, number: safeNumber },
    sound: FAKE_CALL_SOUND,
  };
}

/** Uit melding-data de belscherm-parameters halen (onbekende of te lange waarden worden veilig gemaakt). */
export function paramsFromNotificationData(data: unknown): FakeCallParams | null {
  const d = (data ?? {}) as { type?: unknown; caller?: unknown; voice?: unknown; number?: unknown };
  if (d.type !== 'fake_call') return null;
  return {
    caller: sanitizeCallerName(typeof d.caller === 'string' ? d.caller : ''),
    voice: d.voice === '1' ? '1' : '0',
    number: sanitizeCallerNumber(typeof d.number === 'string' ? d.number : ''),
  };
}

export type RingPhase = 'ringing' | 'talking' | 'closed';
export type RingCloseReason = 'declined' | 'hangup' | 'missed';
export type RingState = {
  phase: RingPhase;
  caller: string;
  number: string;
  startedAt: number | null;
  closedReason: RingCloseReason | null;
};

export function createRing(caller: string | null | undefined, number: string | null | undefined): RingState {
  return { phase: 'ringing', caller: sanitizeCallerName(caller), number: sanitizeCallerNumber(number), startedAt: null, closedReason: null };
}

export function answerRing(state: RingState, now: number): RingState {
  if (state.phase !== 'ringing') return state;
  return { ...state, phase: 'talking', startedAt: now };
}

export function declineRing(state: RingState): RingState {
  if (state.phase !== 'ringing') return state;
  return { ...state, phase: 'closed', closedReason: 'declined' };
}

export function hangUpRing(state: RingState): RingState {
  if (state.phase !== 'talking') return state;
  return { ...state, phase: 'closed', closedReason: 'hangup' };
}

export function missRing(state: RingState): RingState {
  if (state.phase !== 'ringing') return state;
  return { ...state, phase: 'closed', closedReason: 'missed' };
}
