import { httpAction, internalMutation, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, isPremium } from './lib';

export const ENTITLEMENT = 'premium';
const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'CANCELLATION', 'BILLING_ISSUE']);

type RcEvent = { id: string; type: string; app_user_id?: string; original_app_user_id?: string; aliases?: string[]; entitlement_ids?: string[] | null; entitlement_id?: string | null; expiration_at_ms?: number | null };

/** Verwerkt een RevenueCat-webhookevent (idempotent op event-id). */
export const applyEvent = internalMutation({ args: { event: v.any() }, handler: async (ctx, { event }) => {
  const e = event as RcEvent;
  if (!e?.id || !e.type) return 'invalid';
  if (await ctx.db.query('billingEvents').withIndex('by_event', (q) => q.eq('eventId', e.id)).first()) return 'duplicate';
  const candidates = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].filter(Boolean) as string[];
  const userId = candidates.map((c) => ctx.db.normalizeId('users', c)).find(Boolean) ?? undefined;
  await ctx.db.insert('billingEvents', { eventId: e.id, type: e.type, userId });
  if (!userId || !(await ctx.db.get(userId))) return 'unknown_user';
  const ents = e.entitlement_ids ?? (e.entitlement_id ? [e.entitlement_id] : []);
  const sub = await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', userId)).first();
  let patch: { tier: 'free' | 'premium'; expiresAt?: number } | null = null;
  if (e.type === 'EXPIRATION' && ents.includes(ENTITLEMENT)) patch = { tier: 'free', expiresAt: undefined };
  else if (GRANT.has(e.type) && ents.includes(ENTITLEMENT)) patch = { tier: 'premium', expiresAt: e.expiration_at_ms ?? undefined };
  if (!patch) return 'ignored';
  if (sub) await ctx.db.patch(sub._id, { ...patch, provider: 'revenuecat' });
  else await ctx.db.insert('subscriptions', { userId, ...patch, provider: 'revenuecat' });
  await audit(ctx, undefined, `billing.${e.type.toLowerCase()}`, userId);
  return 'applied';
} });

/** POST /revenuecat/webhook — RevenueCat stuurt de ingestelde Authorization-header mee. */
export const webhook = httpAction(async (ctx, req) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook not configured', { status: 503 });
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== secret && auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });
  const body = (await req.json().catch(() => null)) as { event?: RcEvent } | null;
  if (!body?.event) return new Response('bad request', { status: 400 });
  const result = await ctx.runMutation(internal.billing.applyEvent, { event: body.event });
  return new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

export const status = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const s = await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  return { userId: uid, premium: await isPremium(ctx, uid), expiresAt: s?.expiresAt ?? null, tier: s?.tier ?? 'free' };
} });
