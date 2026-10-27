import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { audit, fail, rateLimit, requireUser } from './lib';

/** Registreert SOS (idempotent via clientRef voor de offline-wachtrij) en plant push. Belt NOOIT 112. */
export const trigger = mutation({
  args: { clientRef: v.string(), sessionId: v.optional(v.id('sessions')), lat: v.optional(v.number()), lng: v.optional(v.number()), accuracyM: v.optional(v.number()), locationAt: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    const existing = await ctx.db.query('alerts').withIndex('by_client_ref', (q) => q.eq('clientRef', a.clientRef)).first();
    if (existing) { if (existing.userId !== uid) fail('FORBIDDEN'); return existing._id; }
    await rateLimit(ctx, `sos:${uid}`, 5, 10 * 60_000);
    let sessionId = a.sessionId;
    if (sessionId) { const s = await ctx.db.get(sessionId); if (!s || s.userId !== uid) sessionId = undefined; }
    const alertId = await ctx.db.insert('alerts', { userId: uid, kind: 'sos', clientRef: a.clientRef, sessionId, lat: a.lat, lng: a.lng, accuracyM: a.accuracyM, locationAt: a.locationAt, status: 'open' });
    const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    for (const c of contacts) await ctx.db.insert('deliveries', { alertId, recipientId: c.contactId, status: 'queued' });
    await audit(ctx, uid, 'sos.triggered', alertId, { recipients: contacts.length });
    await ctx.scheduler.runAfter(0, internal.push.sendAlert, { alertId });
    return alertId;
  },
});

export const cancel = mutation({ args: { alertId: v.id('alerts') }, handler: async (ctx, { alertId }) => {
  const uid = await requireUser(ctx);
  const a = await ctx.db.get(alertId);
  if (!a || a.userId !== uid) fail('NOT_FOUND');
  await ctx.db.patch(alertId, { status: 'cancelled' });
  await audit(ctx, uid, 'sos.cancelled', alertId);
} });

/** Alert zichtbaar voor afzender en ontvangers. */
export const get = query({ args: { alertId: v.id('alerts') }, handler: async (ctx, { alertId }) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const a = await ctx.db.get(alertId); if (!a) return null;
  const ds = await ctx.db.query('deliveries').withIndex('by_alert', (q) => q.eq('alertId', alertId)).collect();
  const isOwner = a.userId === uid;
  if (!isOwner && !ds.some((d) => d.recipientId === uid)) return null;
  const deliveries = isOwner ? await Promise.all(ds.map(async (d) => ({ recipientId: d.recipientId, status: d.status, detail: d.detail ?? null,
    name: (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', d.recipientId)).first())?.displayName ?? 'Contact' }))) : [];
  return { alert: a, isOwner, deliveries };
} });
