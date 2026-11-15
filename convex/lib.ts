import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { ageStatus } from './age';

export const FREE_CONTACT_LIMIT = 2;
export const PREMIUM_CONTACT_LIMIT = 20;
export const RETENTION_AFTER_END_MS = 24 * 3600_000;
export const RETENTION_MAX_MS = 3 * 24 * 3600_000;

export const fail = (code: string): never => { throw new ConvexError(code); };

export async function requireUser(ctx: QueryCtx): Promise<Id<'users'>> {
  const uid = await getAuthUserId(ctx);
  if (!uid) fail('NOT_AUTHENTICATED');
  return uid!;
}

/** 16+ self-declared birth year/month. Unknown, under 13, and 13–15 fail closed. Not a parent check. */
export async function requireAdult(ctx: QueryCtx, uid: Id<'users'>) {
  const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  const status = ageStatus(p?.birthYear, p?.birthMonth);
  if (status === 'adult') return;
  if (status === 'unknown') fail('AGE_REQUIRED');
  if (status === 'under13') fail('AGE_UNDER_13');
  fail('AGE_PARENT_REQUIRED');
}

/** Versie van de oudertoestemmingstekst; bij wijziging moeten ouders opnieuw toestemmen. */
export const CHILD_CONSENT_VERSION = 'child-link-v1-2026-11-15';

export async function activeChildLink(ctx: QueryCtx, childId: Id<'users'>) {
  return await ctx.db.query('childLinks').withIndex('by_child_status', (q) => q.eq('childId', childId).eq('status', 'active')).first();
}

/** 16+, of 13–15 met een actieve ouder-koppeling (toestemming staat op het ouderaccount). */
export async function requireAdultOrLinkedChild(ctx: QueryCtx, uid: Id<'users'>) {
  const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  const status = ageStatus(p?.birthYear, p?.birthMonth);
  if (status === 'adult') return { role: 'adult' as const, link: null };
  if (status === 'unknown') fail('AGE_REQUIRED');
  if (status === 'under13') fail('AGE_UNDER_13');
  const link = await activeChildLink(ctx, uid);
  if (!link) fail('AGE_PARENT_REQUIRED');
  return { role: 'child' as const, link };
}

export async function isAdmin(ctx: QueryCtx, uid: Id<'users'>) {
  return !!(await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('userId', uid)).first());
}
/**
 * Nog lopende Premium-gift met de laatste einddatum (bv. uitnodigingsbeloning); null als er geen is.
 * Giften worden aaneengesloten gestapeld, dus "een gift loopt nog" = Premium tot de laatste einddatum.
 */
export async function activeGrant(ctx: QueryCtx, uid: Id<'users'>, now = Date.now()) {
  return await ctx.db.query('premiumGrants').withIndex('by_user', (q) => q.eq('userId', uid).gt('expiresAt', now)).order('desc').first();
}
export async function isStorePremium(ctx: QueryCtx, uid: Id<'users'>) {
  const s = await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  return !!s && s.tier === 'premium' && (s.expiresAt === undefined || s.expiresAt > Date.now());
}
/** Premium = actief winkelabonnement (RevenueCat-webhook) óf een lopende gift. */
export async function isPremium(ctx: QueryCtx, uid: Id<'users'>) {
  if (await isStorePremium(ctx, uid)) return true;
  return !!(await activeGrant(ctx, uid));
}
export async function isBlockedBetween(ctx: QueryCtx, a: Id<'users'>, b: Id<'users'>) {
  const x = await ctx.db.query('blocks').withIndex('by_pair', (q) => q.eq('blockerId', a).eq('blockedId', b)).first();
  const y = await ctx.db.query('blocks').withIndex('by_pair', (q) => q.eq('blockerId', b).eq('blockedId', a)).first();
  return !!(x || y);
}
export async function acceptedContact(ctx: QueryCtx, owner: Id<'users'>, contact: Id<'users'>) {
  const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', owner).eq('contactId', contact)).first();
  return tc?.status === 'accepted' ? tc : null;
}
export const sessionOpen = (s: Doc<'sessions'>, now = Date.now()) =>
  (s.status === 'active' || s.status === 'alert') && s.endedAt === undefined && s.expiresAt > now;

/**
 * Kern van de toegangscontrole. Eigenaar ziet altijd de eigen sessie. Een ander alleen als:
 * sessie open en niet verlopen, expliciet als kijker toegevoegd en niet ingetrokken,
 * geaccepteerd vertrouwd contact, en geen blokkade. Admin-status geeft GEEN toegang.
 */
export async function canViewSession(ctx: QueryCtx, sessionId: Id<'sessions'>, uid: Id<'users'>) {
  const s = await ctx.db.get(sessionId);
  if (!s) return null;
  if (s.userId === uid) return s;
  if (!sessionOpen(s)) return null;
  const v = await ctx.db.query('sessionViewers').withIndex('by_session_viewer', (q) => q.eq('sessionId', sessionId).eq('viewerId', uid)).first();
  if (!v || v.revokedAt !== undefined) return null;
  if (!(await acceptedContact(ctx, s.userId, uid))) return null;
  if (await isBlockedBetween(ctx, s.userId, uid)) return null;
  const vp = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  if (vp?.restricted) return null; // beperkt account (bijv. na misbruikmelding) kijkt nergens mee
  return s;
}

/** Vast-venster rate limiter (transactioneel in een mutation). */
export async function rateLimit(ctx: MutationCtx, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const r = await ctx.db.query('rateLimits').withIndex('by_key', (q) => q.eq('key', key)).first();
  if (!r) { await ctx.db.insert('rateLimits', { key, windowStart: now, hits: 1 }); return; }
  if (r.windowStart < now - windowMs) { await ctx.db.patch(r._id, { windowStart: now, hits: 1 }); return; }
  if (r.hits >= max) fail('RATE_LIMITED');
  await ctx.db.patch(r._id, { hits: r.hits + 1 });
}

export async function audit(ctx: MutationCtx, actorId: Id<'users'> | undefined, action: string, targetId?: string, meta?: unknown) {
  await ctx.db.insert('auditLogs', { actorId, action, targetId, meta });
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function revokeViewersFor(ctx: MutationCtx, owner: Id<'users'>, viewer: Id<'users'>) {
  const vs = await ctx.db.query('sessionViewers').withIndex('by_viewer', (q) => q.eq('viewerId', viewer)).collect();
  for (const v of vs) {
    if (v.revokedAt !== undefined) continue;
    const s = await ctx.db.get(v.sessionId);
    if (s?.userId === owner) await ctx.db.patch(v._id, { revokedAt: Date.now() });
  }
}

export async function displayName(ctx: QueryCtx, uid: Id<'users'>) {
  return (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first())?.displayName || 'Onbekend';
}
