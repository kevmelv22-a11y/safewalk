/**
 * Thuis-check-in: "ik ben om 23:30 thuis".
 * Pure logica, zonder Convex of React, zodat de app en de tests dezelfde regels gebruiken.
 *
 * Leeftijd: de mutaties eisen 16+ (requireAdult). Kindermodus (13–15, gekoppeld aan een ouder)
 * blijft bij de bestaande knop "Ik ben veilig thuis" en start deze timer niet.
 * Er wordt nergens beweerd dat iemand veilig is of dat een melding aankomt.
 */

export const HOME_GRACE_MINUTES = 2;
export const HOME_REMINDER_BEFORE_MS = 60_000;
export const HOME_MIN_LEAD_MS = 30_000;
export const HOME_MAX_MS = 18 * 3600_000;
export const HOME_MAX_ACTIVE = 3;
export const HOME_MAX_EXTENSIONS = 3;
export const HOME_EXTEND_CHOICES = [10, 20] as const;
export const HOME_QUICK_MINUTES = [15, 30, 60, 120] as const;

export type HomeStatus = 'pending' | 'confirmed' | 'cancelled' | 'missed';
export type HomePhase = 'running' | 'due' | 'grace' | 'overdue';

export type ClockInput = { hour: number; minute: number; tomorrow: boolean };
export type DueResult = { ok: true; dueAt: number } | { ok: false; error: string };
export type KnownLocation = { lat: number; lng: number; locationAt: number } | null;
export type ParsedPoint = { lat: number; lng: number; accuracyM?: number; locationAt: number };

export function dueWindowError(dueAt: number, now: number): string | null {
  if (!Number.isFinite(dueAt)) return 'Kies een geldig tijdstip.';
  if (dueAt <= now + HOME_MIN_LEAD_MS) return 'Die tijd is al voorbij of te dichtbij. Kies een later tijdstip, of zet morgen aan.';
  if (dueAt > now + HOME_MAX_MS) return 'Een thuis-check-in kan maximaal 18 uur vooruit. Kies een kortere tijd.';
  return null;
}

function finishDue(dueAt: number, now: number): DueResult {
  const error = dueWindowError(dueAt, now);
  return error ? { ok: false, error } : { ok: true, dueAt };
}

/** Kloktijd op de lokale kalender van `now`. `tomorrow` telt één dag op (na middernacht). */
export function dueFromClock(input: ClockInput, now: number): DueResult {
  const { hour, minute, tomorrow } = input;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { ok: false, error: 'Kies een geldige tijd.' };
  }
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  if (tomorrow) d.setDate(d.getDate() + 1);
  return finishDue(d.getTime(), now);
}

/** "Over X minuten", gerekend vanaf `now`. */
export function dueFromMinutes(minutes: number, now: number): DueResult {
  if (!Number.isInteger(minutes) || minutes < 1) return { ok: false, error: 'Kies een aantal minuten in de toekomst.' };
  return finishDue(now + minutes * 60_000, now);
}

/** Standaard: over ongeveer 30 minuten, afgerond op 5 minuten. `tomorrow` alleen als dat de volgende dag is. */
export function defaultClock(now = Date.now()): ClockInput {
  const target = new Date(now + 30 * 60_000);
  const rounded = Math.ceil(target.getMinutes() / 5) * 5;
  target.setMinutes(rounded, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(target);
  day.setHours(0, 0, 0, 0);
  return { hour: target.getHours(), minute: target.getMinutes(), tomorrow: day.getTime() > today.getTime() };
}

export function cleanLabel(raw: string): string | null {
  const label = String(raw ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return label.length >= 2 ? label : null;
}

export function homePhase(dueAt: number, graceMinutes: number, now: number): HomePhase {
  if (now < dueAt - HOME_REMINDER_BEFORE_MS) return 'running';
  if (now < dueAt) return 'due';
  if (now < dueAt + graceMinutes * 60_000) return 'grace';
  return 'overdue';
}

export function reminderIsDue(dueAt: number, now: number): boolean {
  return now + 20_000 >= dueAt - HOME_REMINDER_BEFORE_MS;
}

export function escalationIsDue(dueAt: number, graceMinutes: number, now: number): boolean {
  return now >= dueAt + graceMinutes * 60_000;
}

export function extendAllowed(extensions: number, minutes: number): boolean {
  return extensions < HOME_MAX_EXTENSIONS && (HOME_EXTEND_CHOICES as readonly number[]).includes(minutes);
}

/** Lokaal seintje. Null als het te dichtbij is: de server herinnert dan alsnog. */
export function localReminderAt(dueAt: number, now: number): number | null {
  const at = dueAt - HOME_REMINDER_BEFORE_MS;
  if (at <= now + 5_000) return null;
  return at;
}

export function ageLabel(at: number, now: number): string {
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  return `${h} u ${min % 60} min geleden`;
}

export function formatDue(dueAt: number, now = Date.now()): string {
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (new Date(now).toDateString() === due.toDateString()) return time;
  const date = due.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

export function reminderBody(label: string, graceMinutes: number): string {
  return `Tijd voor je thuis-check-in (${label}). Bevestig in SafeWalk dat je thuis bent, of verleng. Zonder bevestiging krijgen je gekozen contacten na ${graceMinutes} minuten een melding. Dat helpt hen, en is geen vervanging voor 112.`;
}

export function missedOwnerBody(label: string, warned: boolean): string {
  return warned
    ? `Je hebt de thuis-check-in (${label}) niet op tijd bevestigd. Je gekozen contacten zijn gewaarschuwd. Open SafeWalk als je alsnog thuis bent.`
    : `Je hebt de thuis-check-in (${label}) niet op tijd bevestigd. Er was geen vertrouwd contact meer om te waarschuwen.`;
}

export function missedContactBody(name: string, label: string, point: KnownLocation, now: number): string {
  const where = point
    ? `Laatst bekende locatie (${ageLabel(point.locationAt, now)}, kan verouderd zijn): https://maps.google.com/?q=${point.lat},${point.lng}`
    : 'SafeWalk heeft geen recente locatie: de plek is onbekend.';
  return `${name} heeft niet op tijd bevestigd thuis te zijn (${label}). ${where} Probeer zelf contact op te nemen. Dit is geen vervanging voor 112.`;
}

export function checkedInBody(name: string, label: string, afterMiss: boolean): string {
  const extra = afterMiss ? ' Dit is ná de eerdere melding.' : '';
  return `${name} heeft aangegeven thuis te zijn (${label}). Dat is een melding van die persoon, geen controle of diegene echt thuis is.${extra}`;
}

export function statusCopy(input: {
  status: HomeStatus;
  dueAt: number;
  graceMinutes: number;
  now: number;
  locationKnown: boolean;
}): { title: string; detail: string } {
  if (input.status === 'confirmed') {
    return {
      title: 'Je hebt aangegeven thuis te zijn',
      detail: 'Je gekozen contacten krijgen daar een melding van, als meldingen bij hen werken. SafeWalk controleert niet of je echt thuis bent.',
    };
  }
  if (input.status === 'cancelled') {
    return { title: 'Geannuleerd', detail: 'Er is geen melding over een gemiste check-in naar je contacten gegaan.' };
  }
  if (input.status === 'missed') {
    return {
      title: 'Niet op tijd bevestigd',
      detail: input.locationKnown
        ? 'Je contacten zijn gewaarschuwd met je laatst bekende locatie. Die kan verouderd zijn. Dit is geen vervanging voor 112.'
        : 'Je contacten zijn gewaarschuwd. SafeWalk had geen recente locatie en heeft dat zo gemeld. Dit is geen vervanging voor 112.',
    };
  }
  const phase = homePhase(input.dueAt, input.graceMinutes, input.now);
  if (phase === 'running') {
    return {
      title: 'Check-in loopt',
      detail: input.locationKnown
        ? 'Je laatst bekende locatie wordt bijgewerkt zolang SafeWalk open is en locatie aanstaat. Zonder punt zeggen we eerlijk dat de locatie onbekend is.'
        : 'Er is nog geen locatie. Als je niet op tijd bevestigt, krijgen contacten een melding waarin staat dat de locatie onbekend is.',
    };
  }
  return {
    title: 'Bevestig dat je thuis bent',
    detail: `Na de ingestelde tijd heb je nog ${input.graceMinutes} minuten. Daarna krijgen je contacten een melding. Dit is geen vervanging voor 112.`,
  };
}

export function statusLabel(status: HomeStatus): string {
  switch (status) {
    case 'pending': return 'Loopt';
    case 'confirmed': return 'Thuis gemeld';
    case 'cancelled': return 'Geannuleerd';
    case 'missed': return 'Niet op tijd bevestigd';
    default: return status;
  }
}

/** null = geen locatie meesturen. 'bad' = de invoer is ongeldig (niet stil half bewaren). */
export function parsePoint(
  input: { lat?: number; lng?: number; accuracyM?: number; locationAt?: number },
  now: number,
): ParsedPoint | null | 'bad' {
  const { lat, lng, accuracyM } = input;
  if (lat === undefined && lng === undefined && accuracyM === undefined && input.locationAt === undefined) return null;
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return 'bad';
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'bad';
  if (accuracyM !== undefined && (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100_000)) return 'bad';
  const locationAt = Math.min(input.locationAt ?? now, now);
  if (!Number.isFinite(locationAt) || locationAt < now - 7 * 24 * 3600_000) return 'bad';
  return { lat, lng, ...(accuracyM !== undefined ? { accuracyM } : {}), locationAt };
}
