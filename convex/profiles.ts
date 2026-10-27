import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { fail, isPremium, requireUser } from './lib';
import { getAuthUserId } from '@convex-dev/auth/server';

export const me = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  return p ? { ...p, premium: await isPremium(ctx, uid) } : null;
} });

export const update = mutation({
  args: { displayName: v.optional(v.string()), defaultGraceMinutes: v.optional(v.number()), sosCountdownSeconds: v.optional(v.number()), onboardingDone: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p || p.restricted) fail('FORBIDDEN');
    if (a.displayName !== undefined && a.displayName.length > 80) fail('BAD_REQUEST');
    if (a.defaultGraceMinutes !== undefined && !(a.defaultGraceMinutes >= 1 && a.defaultGraceMinutes <= 30)) fail('BAD_REQUEST');
    if (a.sosCountdownSeconds !== undefined && !(a.sosCountdownSeconds >= 3 && a.sosCountdownSeconds <= 15)) fail('BAD_REQUEST');
    await ctx.db.patch(p!._id, a);
  },
});

export const registerPushToken = mutation({ args: { token: v.string(), platform: v.optional(v.string()) }, handler: async (ctx, a) => {
  const uid = await requireUser(ctx);
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(a.token)) fail('BAD_REQUEST');
  const ex = await ctx.db.query('pushTokens').withIndex('by_token', (q) => q.eq('token', a.token)).first();
  if (ex) await ctx.db.patch(ex._id, { userId: uid, platform: a.platform }); else await ctx.db.insert('pushTokens', { userId: uid, ...a });
} });
