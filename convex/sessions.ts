import { mutation, query, MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
import { queuePush } from './notify';
import { haversineMeters, ALMOST_ARRIVED_M } from './geo';
import { normalizeBatteryPct } from './deviceStatus';
import { acceptedContact, audit, canViewSession, displayName, fail, isPremium, rateLimit, requireAdult, requireUser, sessionOpen } from './lib';

const H = 3600_000;

async function closeSession(ctx: MutationCtx, id: Id<'sessions'>, status: 'ended' | 'expired', reason: 'stopped' | 'arrived' | 'expired' | 'replaced' = status === 'expired' ? 'expired' : 'stopped') {
  const now = Date.now();
  const s = await ctx.db.get(id);
  const active = (await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', id)).collect()).filter((x) => x.revokedAt === undefined).map((x) => x.viewerId);
  if (s && active.length && reason !== 'replaced') {
    const name = await displayName(ctx, s.userId);
    const body = { arrived: `${name} heeft bevestigd veilig te zijn aangekomen.`, stopped: `${name} heeft het delen van de reis gestopt.`, expired: `De reis van ${name} is verlopen; locatie wordt niet meer gedeeld.` }[reason];
    await queuePush(ctx, { kind: 'trip_ended', sessionId: id, recipients: active, title: 'Reis beëindigd', body });
  }
  // Toestelstatus is alleen nodig tijdens de reis: direct wissen.
  await ctx.db.patch(id, { status, endedAt: now, batteryPct: undefined, batteryAt: undefined, lastSeenAt: undefined });
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
    await requireAdult(ctx, uid);
    await rateLimit(ctx, `session:${uid}`, 30, H);
    const now = Date.now();
    const dest = a.destination.trim();
    if (!dest || dest.length > 120) fail('BAD_REQUEST');
    if (a.expectedArrival <= now || a.expectedArrival > now + 12 * H) fail('INVALID_ARRIVAL');
    if (a.viewerIds.length === 0 || a.viewerIds.length > 20) fail('NO_VIEWERS');
    for (const vid of a.viewerIds) if (!(await acceptedContact(ctx, uid, vid))) fail('VIEWER_NOT_TRUSTED');
    // maximaal één open sessie
    for (const s of await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      if (s.endedAt === undefined) await closeSession(ctx, s._id, 'ended', 'replaced');
    const profile = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (profile?.restricted) fail('RESTRICTED');
    const premium = await isPremium(ctx, uid);
    if (a.graceMinutes !== undefined && a.graceMinutes !== 5 && !premium) fail('PREMIUM_REQUIRED');
    const grace = Math.min(30, Math.max(1, a.graceMinutes ?? (premium ? profile?.defaultGraceMinutes : 5) ?? 5));
    const id = await ctx.db.insert('sessions', { userId: uid, destinationLabel: dest, destinationLat: a.destLat, destinationLng: a.destLng,
      expectedArrival: a.expectedArrival, status: 'active', expiresAt: a.expectedArrival + 2 * H });
    for (const vid of new Set(a.viewerIds)) await ctx.db.insert('sessionViewers', { sessionId: id, viewerId: vid });
    await ctx.db.insert('checkIns', { sessionId: id, userId: uid, dueAt: a.expectedArrival, graceMinutes: grace, extensions: 0, status: 'pending' });
    const name = await displayName(ctx, uid);
    await queuePush(ctx, { kind: 'trip_started', sessionId: id, recipients: a.viewerIds, title: `${name} deelt een reis met je`,
      body: `${name} is onderweg naar ${dest} (verwacht ${new Date(a.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}). Je kunt de locatie volgen tot de reis eindigt.` });
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
    if (![10, 20].includes(a.extendMinutes) && !(await isPremium(ctx, uid))) fail('PREMIUM_REQUIRED'); // aanpasbare check-ins = premium
    const due = Math.max(c!.dueAt, Date.now()) + a.extendMinutes * 60_000;
    await ctx.db.patch(c!._id, { dueAt: due, extensions: c!.extensions + 1, status: 'pending', reminderSentAt: undefined });
    await ctx.db.patch(s!._id, { expectedArrival: due, expiresAt: Math.max(s!.expiresAt, due + 2 * H), status: 'active' });
    await audit(ctx, uid, 'check_in.extended', a.sessionId, { minutes: a.extendMinutes });
    return due;
  }
  await ctx.db.patch(c!._id, { status: 'confirmed', respondedAt: Date.now() });
  await closeSession(ctx, s!._id, 'ended', 'arrived');
  await audit(ctx, uid, 'check_in.confirmed', a.sessionId);
  return null;
} });

export const addLocation = mutation({
  args: { sessionId: v.id('sessions'), lat: v.number(), lng: v.number(), accuracyM: v.optional(v.number()), recordedAt: v.number(), batteryPct: v.optional(v.number()) },
  handler: async (ctx, { batteryPct, ...a }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const s = await ctx.db.get(a.sessionId);
    if (!s || s.userId !== uid || !sessionOpen(s)) fail('SESSION_CLOSED');
    if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180 || (a.accuracyM ?? 0) < 0) fail('BAD_REQUEST');
    await rateLimit(ctx, `loc:${uid}`, 240, H);
    const recordedAt = Math.min(a.recordedAt, Date.now());
    await ctx.db.insert('locations', { ...a, userId: uid, recordedAt });
    // Laatst online = wanneer de server dit punt ontving. Batterij alleen als het toestel hem meegeeft (0–100).
    const pct = normalizeBatteryPct(batteryPct);
    await ctx.db.patch(s!._id, { lastSeenAt: Date.now(), ...(pct !== undefined ? { batteryPct: pct, batteryAt: recordedAt } : {}) });
    if (s!.destinationLat !== undefined && s!.destinationLng !== undefined && s!.startDistanceM === undefined)
      await ctx.db.patch(s!._id, { startDistanceM: haversineMeters(a, { lat: s!.destinationLat, lng: s!.destinationLng }) });
    // Bijna aangekomen (eenmalig per sessie)
    if (s!.destinationLat !== undefined && s!.destinationLng !== undefined && s!.almostNotifiedAt === undefined &&
        haversineMeters(a, { lat: s!.destinationLat, lng: s!.destinationLng }) <= ALMOST_ARRIVED_M) {
      await ctx.db.patch(s!._id, { almostNotifiedAt: Date.now() });
      const viewers = (await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', s!._id)).collect()).filter((x) => x.revokedAt === undefined).map((x) => x.viewerId);
      const name = await displayName(ctx, uid);
      await queuePush(ctx, { kind: 'almost_arrived', sessionId: s!._id, recipients: viewers, title: `${name} is bijna aangekomen`, body: `${name} is minder dan ${ALMOST_ARRIVED_M} m van ${s!.destinationLabel}.` });
    }
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
  const notifications = isOwner ? await Promise.all((await ctx.db.query('pushMessages').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect())
    .filter((m) => m.recipientId !== uid).map(async (m) => ({ id: m._id, kind: m.kind, status: m.status, name: await displayName(ctx, m.recipientId) }))) : [];
  const signals = isOwner ? (await ctx.db.query('motionSignals').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()).filter((x) => x.status === 'open') : [];
  return { session: s, isOwner, signals, ownerName: await displayName(ctx, s.userId), checkIn, viewers, notifications };
} });

/** Live locaties; lege lijst als geen toegang. Admins krijgen GEEN uitzondering. */
export const locations = query({ args: { sessionId: v.id('sessions') }, handler: async (ctx, { sessionId }) => {
  const uid = await getAuthUserId(ctx); if (!uid) return [];
  if (!(await canViewSession(ctx, sessionId, uid))) return [];
  const rows = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).order('desc').take(500);
  return rows.reverse().map((r) => ({ lat: r.lat, lng: r.lng, accuracyM: r.accuracyM ?? null, recordedAt: r.recordedAt }));
} });

/** Sessiegeschiedenis (alleen metadata, geen locaties). Gratis: 7 dagen; Premium: 90 dagen. */
export const history = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const premium = await isPremium(ctx, uid);
  const since = Date.now() - (premium ? 90 : 7) * 24 * H;
  const rows = await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).order('desc').take(premium ? 200 : 20);
  return { premium, days: premium ? 90 : 7, sessions: rows.filter((r) => r._creationTime >= since).map((r) => ({
    id: r._id, destination: r.destinationLabel, startedAt: r._creationTime, endedAt: r.endedAt ?? null, status: r.status })) };
} });
