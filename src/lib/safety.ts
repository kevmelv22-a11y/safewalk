// Pure, testbare veiligheidslogica (geen React / native imports).

export const STALE_AFTER_MS = 2 * 60_000;   // > 2 min geen update: waarschuwing
export const LOST_AFTER_MS = 10 * 60_000;   // > 10 min: "geen actuele locatie"

export type Freshness = 'fresh' | 'stale' | 'lost' | 'none';
export function locationFreshness(lastAt: string | Date | null | undefined, now = Date.now()): Freshness {
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

export function timeAgo(at: string | Date | null | undefined, now = Date.now()): string {
  if (!at) return 'nooit';
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s} s geleden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  return `${Math.floor(m / 60)} u ${m % 60} min geleden`;
}

export type CheckInPhase = 'running' | 'due' | 'grace' | 'overdue';
/** Fase van de check-in o.b.v. door de SERVER opgeslagen due_at en grace_minutes. */
export function checkInPhase(dueAt: string | Date, graceMinutes: number, now = Date.now()): CheckInPhase {
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

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const deliveryLabel: Record<string, string> = {
  queued: 'In wachtrij',
  sent: 'Verstuurd naar pushdienst (aflevering niet gegarandeerd)',
  failed: 'Versturen mislukt',
  no_token: 'Contact heeft geen meldingen ingeschakeld',
};

export function mapErrorNl(msg: string | undefined): string {
  if (!msg) return 'Er ging iets mis.';
  if (msg.includes('CONTACT_LIMIT')) return 'Gratis account: maximaal 2 vertrouwde contacten.';
  if (msg.includes('INVITATION_INVALID')) return 'Deze uitnodiging is ongeldig of verlopen.';
  if (msg.includes('INVITATION_SELF')) return 'Je kunt je eigen uitnodiging niet accepteren.';
  if (msg.includes('VIEWER_NOT_TRUSTED')) return 'Alleen geaccepteerde vertrouwde contacten kunnen meekijken.';
  if (msg.includes('RATE_LIMITED')) return 'Te veel verzoeken. Probeer het later opnieuw.';
  if (msg.includes('INVALID_ARRIVAL')) return 'Ongeldige aankomsttijd.';
  if (msg.includes('EXTENSION_NOT_ALLOWED')) return 'Verlengen is niet meer mogelijk.';
  return msg;
}
