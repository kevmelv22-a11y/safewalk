/**
 * Nep-oproep: een realistisch inkomend gesprek om uit een vervelende situatie te komen.
 * Pure logica (geen native imports), zodat het goed te testen is.
 *
 * Gratis (ook 13–15): meteen laten bellen door een standaardnaam.
 * Premium (16+): later laten bellen (inplannen), een eigen naam en een stem in het gesprek.
 */
export const FREE_CALLERS = ['Mama', 'Papa', 'Huisgenoot'] as const;
export const DEFAULT_CALLER = FREE_CALLERS[0];
export const MAX_CALLER_LENGTH = 30;
/** Inplannen: over 1, 5, 10 of 15 minuten. */
export const SCHEDULE_DELAYS_MIN = [1, 5, 10, 15] as const;
export type ScheduleDelay = (typeof SCHEDULE_DELAYS_MIN)[number];

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

export function isScheduleDelay(n: number): n is ScheduleDelay {
  return (SCHEDULE_DELAYS_MIN as readonly number[]).includes(n);
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

export type FakeCallParams = { caller: string; voice: '1' | '0' };

/** Inhoud van de lokale melding voor een ingeplande nep-oproep. */
export function fakeCallNotification(caller: string, voice: boolean) {
  return {
    title: caller,
    body: 'Inkomende oproep · tik om op te nemen',
    data: { type: 'fake_call', caller, voice: voice ? '1' : '0' },
    sound: FAKE_CALL_SOUND,
  };
}

/** Uit melding-data de belscherm-parameters halen (onbekende of te lange waarden worden veilig gemaakt). */
export function paramsFromNotificationData(data: unknown): FakeCallParams | null {
  const d = (data ?? {}) as { type?: unknown; caller?: unknown; voice?: unknown };
  if (d.type !== 'fake_call') return null;
  return { caller: sanitizeCallerName(typeof d.caller === 'string' ? d.caller : ''), voice: d.voice === '1' ? '1' : '0' };
}
