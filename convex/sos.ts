import { mutation, query, MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
import { queuePush, mapsLink } from './notify';
import { audit, displayName, fail, rateLimit, requireAdult, requireUser, sessionOpen } from './lib';
import { notifyLinkViewers } from './viewerAlerts';
import { sessionWhat } from './liveShare';
import { rideShareLine } from './rideShare';

/** Gedeelde SOS-logica (ook voor de dwangcode). Belt NOOIT 112. */
export async function emitSos(
  ctx: MutationCtx,
  uid: Id<'users'>,
  a: { clientRef: string; sessionId?: Id<'sessions'>; lat?: number; lng?: number; accuracyM?: number; locationAt?: number },
  opts?: { skipRateLimit?: boolean; auditAction?: string },
): Promise<Id<'alerts'>> {
  const existing = await ctx.db.query('alerts').withIndex('by_client_ref', (q) => q.eq('clientRef', a.clientRef)).first();
  if (existing) { if (existing.userId !== uid) fail('FORBIDDEN'); return existing._id; }
  if (!opts?.skipRateLimit) await rateLimit(ctx, `sos:${uid}`, 5, 10 * 60_000);
  let sessionId = a.sessionId;
  if (sessionId) { const s = await ctx.db.get(sessionId); if (!s || s.userId !== uid) sessionId = undefined; }
  const alertId = await ctx.db.insert('alerts', { userId: uid, kind: 'sos', clientRef: a.clientRef, sessionId, lat: a.lat, lng: a.lng, accuracyM: a.accuracyM, locationAt: a.locationAt, status: 'open' });
  const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
  const name = await displayName(ctx, uid); const link = mapsLink(a.lat, a.lng);
  const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).order('desc').take(5)).find((s) => sessionOpen(s));
  const ride = rideShareLine(open ? { plate: open.ridePlate, driverName: open.rideDriverName, vehicle: open.rideVehicle } : undefined);
  const base = link ? `${name} heeft SOS geactiveerd. Laatst bekende locatie: ${link}` : `${name} heeft SOS geactiveerd. Geen recente locatie beschikbaar.`;
  if (contacts.length) await queuePush(ctx, { kind: 'sos', alertId, sessionId: sessionId ?? open?._id, recipients: contacts.map((c) => c.contactId), title: `🆘 SOS van ${name}`,
    body: ride ? `${base} ${ride}` : base });
  // Loopt er een reis/timer? Dan zien kijkers met de meekijklink de SOS (en heft dit de privacymodus op).
  if (open) {
    await ctx.db.patch(open._id, { sosAt: Date.now() });
    const lastLoc = a.lat !== undefined && a.lng !== undefined ? { lat: a.lat, lng: a.lng, locationAt: a.locationAt }
      : await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', open._id)).order('desc').first().then((l) => (l ? { lat: l.lat, lng: l.lng, locationAt: l.recordedAt } : {}));
    await notifyLinkViewers(ctx, open._id, 'sos', { what: sessionWhat(open), at: Date.now(), ...lastLoc, batteryPct: open.batteryPct, ride: ride || undefined }, `sos:${alertId}`);
  }
  await audit(ctx, uid, opts?.auditAction ?? 'sos.triggered', alertId, { recipients: contacts.length });
  return alertId;
}

/** Registreert SOS (idempotent via clientRef voor de offline-wachtrij) en plant push. Belt NOOIT 112. */
export const trigger = mutation({
  args: { clientRef: v.string(), sessionId: v.optional(v.id('sessions')), lat: v.optional(v.number()), lng: v.optional(v.number()), accuracyM: v.optional(v.number()), locationAt: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    return await emitSos(ctx, uid, a);
  },
});

export const cancel = mutation({ args: { alertId: v.id('alerts') }, handler: async (ctx, { alertId }) => {
  const uid = await requireUser(ctx);
  const a = await ctx.db.get(alertId);
  if (!a || a.userId !== uid) fail('NOT_FOUND');
  await ctx.db.patch(alertId, { status: 'cancelled' });
  const informed = (await ctx.db.query('pushMessages').withIndex('by_alert', (q) => q.eq('alertId', alertId)).collect()).filter((m) => m.status !== 'queued').map((m) => m.recipientId);
  const name = await displayName(ctx, uid);
  if (informed.length) await queuePush(ctx, { kind: 'sos', recipients: informed, title: `✅ ${name}: vals alarm`, body: `${name} heeft aangegeven dat alles goed is.` });
  // Kijkers via de link die de SOS-mail kregen, krijgen ook de intrekking. Privacymodus weer dicht als er geen andere open SOS is.
  if (a!.kind === 'sos') {
    const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).order('desc').take(5)).find((s) => sessionOpen(s));
    if (open) {
      const otherOpen = (await ctx.db.query('alerts').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
        .some((x) => x._id !== alertId && x.kind === 'sos' && x.status === 'open' && x._creationTime >= open._creationTime);
      if (!otherOpen && open.sosAt !== undefined) await ctx.db.patch(open._id, { sosAt: undefined });
      await notifyLinkViewers(ctx, open._id, 'sos_cancelled', { what: sessionWhat(open), at: a!._creationTime }, `sos_cancelled:${alertId}`, `sos:${alertId}`);
    }
  }
  await audit(ctx, uid, 'sos.cancelled', alertId);
} });

/** Alert zichtbaar voor afzender en ontvangers. */
export const get = query({ args: { alertId: v.id('alerts') }, handler: async (ctx, { alertId }) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const a = await ctx.db.get(alertId); if (!a) return null;
  const ds = await ctx.db.query('pushMessages').withIndex('by_alert', (q) => q.eq('alertId', alertId)).collect();
  const isOwner = a.userId === uid;
  if (!isOwner && !ds.some((d) => d.recipientId === uid)) return null;
  const deliveries = isOwner ? await Promise.all(ds.map(async (d) => ({ recipientId: d.recipientId, status: d.status, detail: d.detail ?? null,
    name: (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', d.recipientId)).first())?.displayName ?? 'Contact' }))) : [];
  return { alert: a, isOwner, deliveries };
} });
