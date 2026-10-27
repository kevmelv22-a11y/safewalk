import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { haversineMeters, ALMOST_ARRIVED_M, Pt } from './geo';
import { fail, requireUser } from './lib';

/**
 * Optionele bewegingssignalen. Deze signalen zijn NOOIT een noodsituatie: ze leiden uitsluitend tot
 * een extra check-in-vraag aan de gebruiker zelf. Contacten worden hierdoor niet gewaarschuwd.
 */
export type SignalKind = 'stationary' | 'deviation' | 'no_data';
export const NO_DATA_MS = 10 * 60_000;
export const STATIONARY_MS = 15 * 60_000;
export const STATIONARY_RADIUS_M = 40;
export const DEVIATION_EXTRA_M = 800;
export const COOLDOWN_MS = 20 * 60_000;

export function detectSignals(i: { locations: (Pt & { recordedAt: number })[]; now: number; sessionStart: number; dest?: Pt; startDistanceM?: number }): SignalKind[] {
  const out: SignalKind[] = [];
  const last = i.locations[i.locations.length - 1];
  if (!last ? i.now - i.sessionStart > NO_DATA_MS : i.now - last.recordedAt > NO_DATA_MS) out.push('no_data');
  if (last && !out.includes('no_data')) {
    const nearDest = i.dest ? haversineMeters(last, i.dest) <= ALMOST_ARRIVED_M : false;
    const windowPts = i.locations.filter((l) => l.recordedAt >= i.now - STATIONARY_MS);
    const older = i.locations.filter((l) => l.recordedAt < i.now - STATIONARY_MS);
    const covered = older.length > 0 || (windowPts.length > 0 && last.recordedAt - windowPts[0].recordedAt >= STATIONARY_MS * 0.8);
    const anchor = older.length ? older[older.length - 1] : windowPts[0];
    if (!nearDest && covered && windowPts.length >= 2 && [anchor, ...windowPts].every((l) => haversineMeters(l, last) <= STATIONARY_RADIUS_M)) out.push('stationary');
    if (i.dest && i.startDistanceM !== undefined) {
      const d = haversineMeters(last, i.dest);
      if (d > Math.max(i.startDistanceM + DEVIATION_EXTRA_M, i.startDistanceM * 1.5)) out.push('deviation');
    }
  }
  return out;
}

export const signalText: Record<SignalKind, string> = {
  stationary: 'Je staat al een tijdje stil. Alles goed?',
  deviation: 'Je lijkt verder van je bestemming te gaan. Alles goed?',
  no_data: 'We ontvangen al even geen locatie meer. Alles goed? (Controleer GPS en internet.)',
};

export const acknowledge = mutation({ args: { signalId: v.id('motionSignals') }, handler: async (ctx, { signalId }) => {
  const uid = await requireUser(ctx);
  const s = await ctx.db.get(signalId);
  if (!s || s.userId !== uid) fail('NOT_FOUND');
  await ctx.db.patch(signalId, { status: 'acknowledged' });
} });
