import { mutation, query, MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
import { acceptedContact, audit, canViewSession, displayName, fail, rateLimit, requireUser, sessionOpen } from './lib';

const H = 3600_000;

async function closeSession(ctx: MutationCtx, id: Id<'sessions'>, status: 'ended' | 'expired') {
  const now = Date.now();
  await ctx.db.patch(id, { status, endedAt: now });
  for (const c of await ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', id)).collect())
    if (c.status === 'pending') await ctx.db.patch(c._id, { status: 'cancelled' });
  for (const vw of await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', id)).collect())
    if (vw.revokedAt === undefined) await ctx.db.patch(vw._id, { revokedAt: now });
}
export { closeSession };

export const start = mutation({
  args: { destination: v.string(), destLat: v.optional(v.number()), destLng: v.optional(v.number()), expectedArrival: v.number(), viewerIds: v.array(v.id('users')), graceMinutes: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `session:${uid}`, 30, H);
    const now = Date.now();
    const dest = a.destination.trim();
    if (!dest || dest.length > 120) fail('BAD_REQUEST');
    if (a.expectedArrival <= now || a.expectedArrival > now + 12 * H) fail('INVALID_ARRIVAL');
    if (a.viewerIds.length === 0 || a.viewerIds.length > 20) fail('NO_VIEWERS');
    for (const vid of a.viewerIds) if (!(await acceptedContact(ctx, uid, vid))) fail('VIEWER_NOT_TRUSTED');
    // maximaal één open sessie
    for (const s of await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      if (s.endedAt === undefined) await closeSession(ctx, s._id, 'ended');
    const profile = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    const grace = Math.min(30, Math.max(1, a.graceMinutes ?? profile?.defaultGraceMinutes ?? 5));
    const id = await ctx.db.insert('sessions', { userId: uid, destinationLabel: dest, destinationLat: a.destLat, destinationLng: a.destLng,
      expectedArrival: a.expectedArrival, status: 'active', expiresAt: a.expectedArrival + 2 * H });
    for (const vid of new Set(a.viewerIds)) await ctx.db.insert('sessionViewers', { sessionId: id, viewerId: vid });
    await ctx.db.insert('checkIns', { sessionId: id, userId: uid, dueAt: a.expectedArrival, graceMinutes: grace, extensions: 0, status: 'pending' });
    await audit(ctx, uid, 'session.started', id, { viewers: a.viewerIds.length });
    return id;
  },
});

export const end = mutation({ args: { sessionId: v.id('sessions') }, handler: async (ctx, { sessionId }) => {
  const uid = await requireUser(ctx);
  const s = await ctx.db.get(sessionId);
  if (!s || s.userId !== uid) fail('SESSION_NOT_FOUND');
  if (s!.endedAt === undefined) await closeSession(ctx, sessionId, 'ended');
  await audit(ctx, uid, 'session.ended', sessionId);
} });

export const revokeViewer = mutation({ args: { sessionId: v.id('sessions'), viewerId: v.id('users') }, handler: async (ctx, a) => {
  const uid = await requireUser(ctx);
  const s = await ctx.db.get(a.sessionId);
  if (!s || s.userId !== uid) fail('SESSION_NOT_FOUND');
  const vw = await ctx.db.query('sessionViewers').withIndex('by_session_viewer', (q) => q.eq('sessionId', a.sessionId).eq('viewerId', a.viewerId)).first();
  if (vw && vw.revokedAt === undefined) await ctx.db.patch(vw._id, { revokedAt: Date.now() });
  await audit(ctx, uid, 'session.viewer_revoked', a.sessionId);
} });

/** "Alles goed" (extendMinutes=0 → bevestigen en sessie beëindigen) of verlengen (max 3×, max 60 min). */
export const respondCheckIn = mutation({ args: { sessionId: v.id('sessions'), extendMinutes: v.number() }, handler: async (ctx, a) => {
  const uid = await requireUser(ctx);
  const s = await ctx.db.get(a.sessionId);
  if (!s || s.userId !== uid || s.endedAt !== undefined) fail('CHECK_IN_NOT_FOUND');
  const all = await ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', a.sessionId)).collect();
  const c = all.filter((x) => x.status === 'pending' || x.status === 'missed').pop();
  if (!c) fail('CHECK_IN_NOT_FOUND');
  if (a.extendMinutes > 0) {
    if (a.extendMinutes > 60 || c!.extensions >= 3) fail('EXTENSION_NOT_ALLOWED');
    const due = Math.max(c!.dueAt, Date.now()) + a.extendMinutes * 60_000;
    await ctx.db.patch(c!._id, { dueAt: due, extensions: c!.extensions + 1, status: 'pending' });
    await ctx.db.patch(s!._id, { expectedArrival: due, expiresAt: Math.max(s!.expiresAt, due + 2 * H), status: 'active' });
    await audit(ctx, uid, 'check_in.extended', a.sessionId, { minutes: a.extendMinutes });
    return due;
  }
  await ctx.db.patch(c!._id, { status: 'confirmed', respondedAt: Date.now() });
  await closeSession(ctx, s!._id, 'ended');
  await audit(ctx, uid, 'check_in.confirmed', a.sessionId);
  return null;
} });

export const addLocation = mutation({
  args: { sessionId: v.id('sessions'), lat: v.number(), lng: v.number(), accuracyM: v.optional(v.number()), recordedAt: v.number() },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    const s = await ctx.db.get(a.sessionId);
    if (!s || s.userId !== uid || !sessionOpen(s)) fail('SESSION_CLOSED');
    if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180 || (a.accuracyM ?? 0) < 0) fail('BAD_REQUEST');
    await rateLimit(ctx, `loc:${uid}`, 240, H);
    await ctx.db.insert('locations', { ...a, userId: uid, recordedAt: Math.min(a.recordedAt, Date.now()) });
  },
});

export const deleteMyHistory = mutation({ args: {}, handler: async (ctx) => {
  const uid = await requireUser(ctx);
  const rows = await ctx.db.query('locations').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
  for (const r of rows) await ctx.db.delete(r._id);
  await audit(ctx, uid, 'locations.deleted', undefined, { count: rows.length });
  return rows.length;
} });

// ───────── Queries (reactief) ─────────
export const overview = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return { mine: null, watching: [] };
  const mine = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).order('desc').take(5)).find((s) => s.endedAt === undefined) ?? null;
  const watching = [];
  for (const vw of await ctx.db.query('sessionViewers').withIndex('by_viewer', (q) => q.eq('viewerId', uid)).order('desc').take(50)) {
    if (vw.revokedAt !== undefined) continue;
    const s = await canViewSession(ctx, vw.sessionId, uid);
    if (s) watching.push({ ...s, ownerName: await displayName(ctx, s.userId) });
  }
  return { mine, watching };
} });

/** Sessie-details; null als geen toegang (RLS-equivalent). */
export const get = query({ args: { sessionId: v.id('sessions') }, handler: async (ctx, { sessionId }) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const s = await canViewSession(ctx, sessionId, uid); if (!s) return null;
  const isOwner = s.userId === uid;
  const checkIn = (await ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()).pop() ?? null;
  const viewers = isOwner ? await Promise.all((await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect())
    .map(async (x) => ({ viewerId: x.viewerId, revoked: x.revokedAt !== undefined, name: await displayName(ctx, x.viewerId) }))) : [];
  return { session: s, isOwner, ownerName: await displayName(ctx, s.userId), checkIn, viewers };
} });

/** Live locaties; lege lijst als geen toegang. Admins krijgen GEEN uitzondering. */
export const locations = query({ args: { sessionId: v.id('sessions') }, handler: async (ctx, { sessionId }) => {
  const uid = await getAuthUserId(ctx); if (!uid) return [];
  if (!(await canViewSession(ctx, sessionId, uid))) return [];
  const rows = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).order('desc').take(500);
  return rows.reverse().map((r) => ({ lat: r.lat, lng: r.lng, accuracyM: r.accuracyM ?? null, recordedAt: r.recordedAt }));
} });
