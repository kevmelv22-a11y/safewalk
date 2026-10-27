import { internalMutation, mutation, query, QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, isAdmin, isPremium, rateLimit, requireUser } from './lib';

/**
 * Beheerfuncties. Bewust GEEN toegang tot locaties, sessies of bestemmingen:
 * er bestaat geen admin-functie die de tabellen locations/sessions/sessionViewers leest (behalve tellingen).
 */
async function requireAdmin(ctx: QueryCtx) {
  const uid = await requireUser(ctx);
  if (!(await isAdmin(ctx, uid))) fail('FORBIDDEN');
  return uid;
}

export const amIAdmin = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); return uid ? await isAdmin(ctx, uid) : false;
} });

export const users = query({ args: { search: v.optional(v.string()) }, handler: async (ctx, { search }) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query('profiles').order('desc').take(500);
  const out = await Promise.all(rows.map(async (p) => {
    const u = await ctx.db.get(p.userId);
    const sub = await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', p.userId)).first();
    return { userId: p.userId, displayName: p.displayName, email: u?.email ?? null, restricted: p.restricted, tier: sub?.tier ?? 'free',
      premium: await isPremium(ctx, p.userId), createdAt: p._creationTime };
  }));
  const s = search?.trim().toLowerCase();
  return s ? out.filter((u) => u.displayName.toLowerCase().includes(s) || (u.email ?? '').toLowerCase().includes(s)) : out;
} });

/** Beperkt een account: geen nieuwe reizen/uitnodigingen en lopende meekijk-toegang wordt ingetrokken. SOS blijft werken. */
export const setRestricted = mutation({ args: { userId: v.id('users'), restricted: v.boolean(), reason: v.optional(v.string()) }, handler: async (ctx, a) => {
  const admin = await requireAdmin(ctx);
  const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', a.userId)).first();
  if (!p) fail('NOT_FOUND');
  await ctx.db.patch(p!._id, { restricted: a.restricted });
  if (a.restricted) for (const vw of await ctx.db.query('sessionViewers').withIndex('by_viewer', (q) => q.eq('viewerId', a.userId)).collect())
    if (vw.revokedAt === undefined) await ctx.db.patch(vw._id, { revokedAt: Date.now() });
  await audit(ctx, admin, a.restricted ? 'admin.restrict' : 'admin.unrestrict', a.userId, { reason: a.reason?.slice(0, 300) });
} });

export const reports = query({ args: {}, handler: async (ctx) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query('abuseReports').order('desc').take(200);
  const name = async (id: typeof rows[number]['reporterId']) => (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', id)).first())?.displayName ?? '(verwijderd)';
  return Promise.all(rows.map(async (r) => ({ ...r, reporterName: await name(r.reporterId), reportedName: await name(r.reportedId) })));
} });

export const setReportStatus = mutation({ args: { reportId: v.id('abuseReports'), status: v.union(v.literal('open'), v.literal('reviewing'), v.literal('closed')) }, handler: async (ctx, a) => {
  const admin = await requireAdmin(ctx);
  await ctx.db.patch(a.reportId, { status: a.status });
  await audit(ctx, admin, 'admin.report_status', a.reportId, { status: a.status });
} });

/** Geanonimiseerde statistieken: alleen tellingen, geen identiteiten of locaties. */
export const stats = query({ args: {}, handler: async (ctx) => {
  await requireAdmin(ctx);
  const day = Date.now() - 24 * 3600_000;
  const profiles = await ctx.db.query('profiles').collect();
  const subs = await ctx.db.query('subscriptions').collect();
  const sessions = await ctx.db.query('sessions').collect();
  const alerts = await ctx.db.query('alerts').collect();
  const pushes = (await ctx.db.query('pushMessages').order('desc').take(2000)).filter((m) => m._creationTime > day);
  const k = (n: number) => (n > 0 && n < 5 ? '<5' : String(n)); // kleine aantallen afronden tegen herleidbaarheid
  return {
    users: profiles.length, restricted: k(profiles.filter((p) => p.restricted).length),
    premium: k(subs.filter((s) => s.tier === 'premium' && (s.expiresAt === undefined || s.expiresAt > Date.now())).length),
    activeSessions: k(sessions.filter((s) => s.endedAt === undefined).length), sessions24h: k(sessions.filter((s) => s._creationTime > day).length),
    sos24h: k(alerts.filter((a) => a.kind === 'sos' && a._creationTime > day).length),
    missedCheckIns24h: k(alerts.filter((a) => a.kind === 'missed_check_in' && a._creationTime > day).length),
    push24h: Object.fromEntries(['delivered', 'sent', 'failed', 'no_token', 'unknown', 'queued'].map((s) => [s, pushes.filter((p) => p.status === s).length])),
    openReports: (await ctx.db.query('abuseReports').collect()).filter((r) => r.status !== 'closed').length,
  };
} });

export const errors = query({ args: {}, handler: async (ctx) => {
  await requireAdmin(ctx);
  return (await ctx.db.query('errorLogs').order('desc').take(200)).map((e) => ({ id: e._id, at: e._creationTime, source: e.source, message: e.message }));
} });

export const subscriptions = query({ args: {}, handler: async (ctx) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query('subscriptions').collect();
  return Promise.all(rows.filter((s) => s.tier === 'premium').map(async (s) => ({
    userId: s.userId, displayName: (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', s.userId)).first())?.displayName ?? '', expiresAt: s.expiresAt ?? null, provider: s.provider ?? null })));
} });

export const auditLog = query({ args: {}, handler: async (ctx) => {
  await requireAdmin(ctx);
  return (await ctx.db.query('auditLogs').order('desc').take(200)).map((a) => ({ id: a._id, at: a._creationTime, action: a.action, actor: a.actorId ?? null }));
} });

/** Client-foutmeldingen (zonder PII), rate-limited. */
export const logClientError = mutation({ args: { source: v.string(), message: v.string() }, handler: async (ctx, a) => {
  const uid = await getAuthUserId(ctx);
  await rateLimit(ctx, `err:${uid ?? 'anon'}`, 30, 3600_000);
  await ctx.db.insert('errorLogs', { source: `client.${a.source.slice(0, 40)}`, message: a.message.slice(0, 500), userId: uid ?? undefined });
} });

/** Beheerder aanwijzen via CLI: npx convex run admin:grantAdmin '{"email":"..."}' */
export const grantAdmin = internalMutation({ args: { email: v.string(), revoke: v.optional(v.boolean()) }, handler: async (ctx, { email, revoke }) => {
  const u = await ctx.db.query('users').withIndex('email', (q) => q.eq('email', email.trim().toLowerCase())).first();
  if (!u) fail('NOT_FOUND');
  const ex = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('userId', u!._id)).first();
  if (revoke) { if (ex) await ctx.db.delete(ex._id); } else if (!ex) await ctx.db.insert('admins', { userId: u!._id });
  await audit(ctx, undefined, revoke ? 'admin.revoked' : 'admin.granted', u!._id);
} });
