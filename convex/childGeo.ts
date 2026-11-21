import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { queuePush, mapsLink } from './notify';
import { displayName } from './lib';
import { fenceTransition, isInsideFence } from './geofence';

const FENCE_COOLDOWN_MS = 5 * 60_000;

/**
 * Controleert thuis/school-zones van een kind na een nieuw locatiepunt.
 * Eerste punt zet alleen de stand (geen melding). Daarna enter/leave naar de ouder.
 */
export async function applyChildGeofences(
  ctx: MutationCtx,
  opts: { childId: Id<'users'>; linkId: Id<'childLinks'>; lat: number; lng: number; recordedAt: number; sessionId?: Id<'sessions'> },
) {
  const fences = await ctx.db.query('geofences').withIndex('by_link', (q) => q.eq('linkId', opts.linkId)).collect();
  if (!fences.length) return;
  const name = await displayName(ctx, opts.childId);
  const link = mapsLink(opts.lat, opts.lng);
  const now = Date.now();
  for (const f of fences) {
    const inside = isInsideFence({ lat: opts.lat, lng: opts.lng }, f);
    const ev = fenceTransition(f.lastInside, inside);
    await ctx.db.patch(f._id, { lastInside: inside, ...(ev ? { lastEventAt: now } : {}) });
    if (!ev) continue;
    if (f.lastEventAt !== undefined && now - f.lastEventAt < FENCE_COOLDOWN_MS) continue;
    const kind = ev === 'enter' ? 'geofence_enter' as const : 'geofence_leave' as const;
    const where = f.label || (f.kind === 'home' ? 'thuis' : 'school');
    const title = ev === 'enter' ? `${name} is bij ${where} aangekomen` : `${name} heeft ${where} verlaten`;
    const body = link
      ? `${title}. Laatst bekende locatie: ${link}. SafeWalk belt niet 112.`
      : `${title}. SafeWalk belt niet 112.`;
    const alertId = await ctx.db.insert('alerts', {
      userId: opts.childId, kind, sessionId: opts.sessionId, status: 'open',
      lat: opts.lat, lng: opts.lng, locationAt: opts.recordedAt,
      clientRef: `geo:${f._id}:${ev}:${Math.floor(now / FENCE_COOLDOWN_MS)}`,
    });
    await queuePush(ctx, {
      kind, alertId, sessionId: opts.sessionId, recipients: [f.parentId],
      title, body,
    });
  }
}
