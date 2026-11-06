/**
 * Android volume×2 (trusted native key event, app in foreground only).
 * - Opt-in OFF (default): opens /quick-ping, the user confirms with a tap (same as tile/shortcut/deep link).
 * - Opt-in ON: sends live location to trusted app contacts immediately, max once per COOLDOWN_MS, and then
 *   opens /quick-ping?sent=… so the user sees what happened. Deep links never auto-send.
 */
export const COOLDOWN_MS = 60_000;
let lastSentAt = 0;
export function __resetVolumeCooldown() { lastSentAt = 0; }

export type VolumeDeps = {
  optedIn: () => Promise<boolean>;
  getLocation: () => Promise<{ locationConsent: false } | { locationConsent: true; lat: number; lng: number; accuracyM?: number; locationAt: number }>;
  send: (loc: { lat: number; lng: number; accuracyM?: number; locationAt: number; locationConsent: true }) => Promise<{ recipients: number }>;
  navigate: (href: string) => void;
  now?: () => number;
};

export async function handleVolumeDoublePress(d: VolumeDeps): Promise<'confirm' | 'sent' | 'cooldown' | 'no_consent' | 'failed'> {
  if (!(await d.optedIn())) { d.navigate('/quick-ping'); return 'confirm'; }
  const now = (d.now ?? Date.now)();
  if (now - lastSentAt < COOLDOWN_MS) { d.navigate('/quick-ping?sent=cooldown'); return 'cooldown'; }
  const loc = await d.getLocation();
  if (!loc.locationConsent) { d.navigate('/quick-ping?sent=no_consent'); return 'no_consent'; }
  lastSentAt = now;
  try {
    const r = await d.send(loc);
    d.navigate(`/quick-ping?sent=${r.recipients}`);
    return 'sent';
  } catch {
    d.navigate('/quick-ping?sent=failed');
    return 'failed';
  }
}
