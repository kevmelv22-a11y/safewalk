// Gedeeld (server + app + meekijkpagina-tekst): batterij en laatst-online bij een gemiste check-in.
export type DeviceStatus = { batteryPct?: number | null; batteryAt?: number | null; lastSeenAt?: number | null };

/** Batterij als heel percentage 0–100; ongeldige of onbekende waarden (web geeft -1) → undefined. */
export function normalizeBatteryPct(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
  if (v < 0 || v > 100) return undefined;
  return Math.round(v);
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

/** Eén regel voor pushtekst/scherm, bv. "Batterij 12% (21:02) · laatst online 21:04". Leeg als niets bekend is. */
export function deviceStatusLine(d: DeviceStatus): string {
  const parts: string[] = [];
  if (typeof d.batteryPct === 'number') parts.push(`Batterij ${d.batteryPct}%${d.batteryAt ? ` (${hhmm(d.batteryAt)})` : ''}`);
  if (typeof d.lastSeenAt === 'number') parts.push(`laatst online ${hhmm(d.lastSeenAt)}`);
  const line = parts.join(' · ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
}

/** Korte uitleg die helpt kiezen tussen "telefoon leeg" en "er is iets mis". */
export function deviceStatusHint(d: DeviceStatus, now: number): string | null {
  if (typeof d.batteryPct === 'number' && d.batteryPct <= 10) return 'De batterij was bijna leeg; de telefoon kan uit zijn gegaan.';
  if (typeof d.lastSeenAt === 'number' && now - d.lastSeenAt > 10 * 60_000) return 'De telefoon heeft al een tijd niets doorgegeven (geen bereik, app dicht of telefoon uit).';
  return null;
}
