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

/** Zoals validateSessionInput, maar zonder app-contact mag ook, mits er een meekijklink bij komt. */
export function validateStartInput(i: { destination: string; arrival: Date; viewerIds: string[]; withLink: boolean }, now = Date.now()): string | null {
  if (i.withLink && i.viewerIds.length === 0) {
    const r = validateSessionInput({ ...i, viewerIds: ['link'] }, now);
    return r;
  }
  if (!i.withLink && i.viewerIds.length === 0) return 'Kies minstens één vertrouwd contact, of zet de meekijklink aan.';
  return validateSessionInput(i, now);
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
  low_battery: 'Batterij bijna leeg', not_live: 'Niet meer live',
};

export function mapErrorNl(msg: string | undefined): string {
  if (!msg) return 'Er ging iets mis.';
  if (msg.includes('E2E_ENVELOPE_MISSING')) return 'Voor deze versleutelde opname is geen sleutel voor jou gedeeld. Vraag de eigenaar je opnieuw toe te voegen nadat je je publieke sleutel hebt geregistreerd.';
  if (msg.includes('E2E_KEY_MISMATCH')) return 'Deze opname is versleuteld voor een andere (oudere) sleutel van jou. Ontsleutelen kan niet op dit apparaat.';
  if (msg.includes('E2E_NO_LOCAL_KEY')) return 'Er staat geen sleutel op dit apparaat. Maak er een aan bij Opnames; opnames die voor een eerdere sleutel waren gedeeld, kun je hier niet openen.';
  if (msg.includes('NO_CSPRNG')) return 'Veilige willekeurige getallen zijn niet beschikbaar op dit apparaat; versleutelen is gestopt.';
  if (msg.includes('E2E_REQUIRED')) return 'Alleen versleutelde opnames kunnen worden geüpload.';
  if (msg.includes('DEK_MISSING')) return 'De sleutel van deze opname staat niet op dit apparaat (alleen op het apparaat dat uploadde).';
  if (msg.includes('DECRYPT_FAILED')) return 'Ontsleutelen mislukt: verkeerde sleutel of het bestand is gewijzigd.';
  if (msg.includes('RECORDING_TOO_LARGE')) return 'Opname is te groot (max. 24 MB).';
  if (msg.includes('CONTACT_LIMIT')) return 'Gratis account: maximaal 2 vertrouwde contacten.';
  if (msg.includes('INVITATION_INVALID')) return 'Deze uitnodiging is ongeldig of verlopen.';
  if (msg.includes('INVITATION_SELF')) return 'Je kunt je eigen uitnodiging niet accepteren.';
  if (msg.includes('NO_VIEWERS')) return 'Kies minstens één vertrouwd contact, of zet de meekijklink aan.';
  if (msg.includes('LOCATION_CONSENT_REQUIRED')) return 'Zonder toestemming voor je locatie maakt SafeWalk geen meekijklink.';
  if (msg.includes('SESSION_CLOSED')) return 'Deze reis is al beëindigd.';
  if (msg.includes('VIEWER_NOT_TRUSTED')) return 'Alleen geaccepteerde vertrouwde contacten kunnen meekijken.';
  if (msg.includes('PREMIUM_REQUIRED')) return 'Deze functie is onderdeel van Premium.';
  if (msg.includes('RESTRICTED')) return 'Je account is beperkt. Neem contact op met support@vonkbyte.nl. SOS blijft werken.';
  if (msg.includes('RATE_LIMITED')) return 'Te veel verzoeken. Probeer het later opnieuw.';
  if (msg.includes('INVALID_ARRIVAL')) return 'Ongeldige aankomsttijd.';
  if (msg.includes('EXTENSION_NOT_ALLOWED')) return 'Verlengen is niet meer mogelijk.';
  if (msg.includes('EMAIL_NOT_CONFIGURED')) return 'E-mailverificatie is momenteel niet beschikbaar. Probeer het later opnieuw.';
  if (msg.includes('EMAIL_SEND_FAILED')) return 'De e-mail kon niet worden verstuurd. Probeer het later opnieuw.';
  if (msg.includes('AGE_REQUIRED')) return 'Vul eerst je geboortejaar en -maand in. Zonder leeftijd blijven delen, opnames, contacten, aankopen en de assistent uit.';
  if (msg.includes('AGE_UNDER_13')) return 'SafeWalk is niet bruikbaar onder 13 jaar.';
  if (msg.includes('AGE_PARENT_REQUIRED')) return 'Van 13 tot en met 15 jaar blijven delen, opnames, contacten, aankopen en de assistent uit. Ouderlijke machtiging is nog niet ingebouwd.';
  if (msg.includes('AGE_LOCKED')) return 'Een eerdere geboortedatum kun je niet later invullen.';
  if (msg.includes('AGE_INVALID')) return 'Vul een geldig geboortejaar en een maand van 1 tot 12 in.';
  if (msg.includes('PIN_NOT_SET')) return 'Stel eerst een veiligheidscode in.';
  if (msg.includes('PIN_INVALID')) return 'Gebruik 4–8 tekens (cijfers en letters) en bevestig dezelfde code. Hoofdletters tellen mee.';
  if (msg.includes('PIN_SAME_AS_DURESS') || msg.includes('DURESS_SAME_AS_PIN')) return 'De dwangcode moet anders zijn dan je veiligheidscode.';
  if (msg.includes('PIN_WRONG') || msg.includes('PIN_REQUIRED')) return 'Onjuiste code. Probeer opnieuw.';
  if (msg.includes('WEAK_PASSWORD')) return 'Gebruik een wachtwoord van minstens 10 tekens.';
  if (/invalid code|could not verify|InvalidAccountId|InvalidSecret/i.test(msg)) return 'De code is onjuist of verlopen.';
  if (isNetworkError(msg)) return 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.';
  if (/Server Error|Uncaught|\[CONVEX|\[Request ID/i.test(msg)) return 'Er ging iets mis op de server. Probeer het opnieuw.';
  return msg;
}

/** Herkent netwerk-/time-outfouten (geen serverantwoord), los van de exacte bibliotheektekst. */
export function isNetworkError(msg: string | undefined): boolean {
  return !!msg && /network|Failed to fetch|fetch failed|offline|TIMEOUT|timed out|Connection lost|WebSocket/i.test(msg);
}

/**
 * Foutmelding bij het controleren van de veiligheidscode. Een netwerkfout is GEEN foute code:
 * dan is er niets gecontroleerd en moet de gebruiker dat eerlijk zien.
 */
export function pinErrorNl(code: string): string {
  if (code.includes('RATE_LIMITED')) return 'Te veel pogingen. Wacht even.';
  if (code.includes('PIN_WRONG') || code.includes('PIN_REQUIRED')) return 'Onjuiste code. Probeer opnieuw.';
  if (isNetworkError(code) || code.includes('NOT_AUTHENTICATED')) return 'Geen verbinding met de server: je code is niet gecontroleerd. Probeer opnieuw als je online bent.';
  return 'Code controleren lukte niet: ' + mapErrorNl(code);
}

/** Normaliseert een ingevoerde OTP-code (spaties/streepjes eruit) en controleert 6 cijfers. */
export function normalizeCode(input: string): string | null {
  const c = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(c) ? c : null;
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export type SharingStatus = { live: boolean; kind: 'ok' | 'warn' | 'danger'; text: string; lastAt: number | null };
/**
 * Eerlijke deelstatus voor de eigenaar van een reis: draait er op deze telefoon echt een
 * locatiewatcher, en hoe vers is het laatste punt dat de server heeft?
 */
export function sharingStatus(watching: boolean, lastAt: number | null, now = Date.now(), mode: 'background' | 'foreground' | null = 'foreground'): SharingStatus {
  if (!watching) {
    return { live: false, kind: 'danger', lastAt,
      text: 'Je locatie wordt op dit moment NIET gedeeld. Je meekijkers zien alleen het laatste punt.' };
  }
  const bg = mode === 'background';
  const f = locationFreshness(lastAt, now);
  if (f === 'fresh') return { live: true, kind: 'ok', lastAt, text: bg
    ? 'Je locatie wordt gedeeld, ook met scherm uit of SafeWalk op de achtergrond. Veeg SafeWalk niet weg.'
    : 'Je locatie wordt gedeeld zolang SafeWalk open is.' };
  if (f === 'none') return { live: true, kind: 'warn', lastAt, text: 'Delen staat aan, maar er is nog geen locatie bij de server aangekomen (wacht op GPS of internet).' };
  return { live: true, kind: 'warn', lastAt, text: bg
    ? 'Delen staat aan, maar het laatste punt is oud. Check GPS, internet en of batterijbesparing SafeWalk niet beperkt.'
    : 'Delen staat aan, maar het laatste punt is oud. Check GPS en internet, en houd SafeWalk open.' };
}

/** Titel + uitleg voor een melding, per soort (voorheen kreeg alles behalve SOS "Check-in gemist"). */
export function alertTitle(kind: string, clientRef?: string | null): { title: string; explain: string } {
  switch (kind) {
    case 'sos': return { title: '🆘 SOS-melding', explain: 'Deze persoon heeft op SOS gedrukt.' };
    case 'missed_check_in': return { title: '⚠️ Check-in gemist', explain: 'Deze persoon heeft niet op tijd bevestigd veilig te zijn aangekomen.' };
    case 'unsafe': return { title: '🚨 Voelt zich niet veilig', explain: 'Deze persoon heeft gevaarmodus aangezet: er klinkt een alarm op de telefoon.' };
    case 'wrong_pin': return { title: '🔴 Stil alarm', explain: 'Er is een verkeerde veiligheidscode ingevoerd. Dat kan betekenen dat iemand diegene dwingt het alarm te stoppen.' };
    case 'come_quick':
      return clientRef?.startsWith('live-')
        ? { title: '📍 Locatie gedeeld', explain: 'Deze persoon stuurde je de huidige locatie (momentopname).' }
        : { title: '🏃 Kom snel', explain: 'Deze persoon vraagt je zo snel mogelijk te komen.' };
    case 'arrived_safe': return { title: '✅ Veilig aangekomen', explain: 'Deze persoon heeft bevestigd dat alles goed is.' };
    default: return { title: 'Melding', explain: '' };
  }
}
