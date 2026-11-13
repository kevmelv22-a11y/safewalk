import { query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { ageStatus } from './age';
import { activeGrant, audit } from './lib';

/**
 * Vrienden uitnodigen: als iemand jouw uitnodiging accepteert en daardoor een NIEUW vertrouwd contact wordt,
 * krijgen jullie allebei 1 maand Premium. Geen betaling en geen RevenueCat: alleen een Convex-gift (premiumGrants).
 */
export const REFERRAL_DAYS = 30;
export const REFERRAL_MS = REFERRAL_DAYS * 24 * 3600_000;
/** Maximaal aantal beloonde uitnodigingen per uitnodiger per 365 dagen (tegen misbruik met nep-accounts). */
export const MAX_REWARDS_PER_YEAR = 3;
const YEAR_MS = 365 * 24 * 3600_000;

export type ReferralOutcome = 'rewarded' | 'not_adult' | 'invitee_already_rewarded' | 'pair_already_rewarded' | 'inviter_limit';

async function isAdult(ctx: MutationCtx, uid: Id<'users'>) {
  const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
  return ageStatus(p?.birthYear, p?.birthMonth) === 'adult';
}

async function grantMonth(ctx: MutationCtx, userId: Id<'users'>, referralId: Id<'referrals'>, now: number) {
  const current = await activeGrant(ctx, userId, now);
  const startsAt = Math.max(now, current?.expiresAt ?? now);
  await ctx.db.insert('premiumGrants', { userId, source: 'referral', referralId, startsAt, expiresAt: startsAt + REFERRAL_MS });
}

/**
 * Wordt aangeroepen nadat een uitnodiging is geaccepteerd en er een nieuwe vertrouwde-contactrelatie is ontstaan.
 * Alleen 16+ (allebei), één keer per nieuwe gebruiker als genodigde, één keer per paar, max. 3 per jaar per uitnodiger.
 */
export async function rewardReferral(ctx: MutationCtx, inviterId: Id<'users'>, inviteeId: Id<'users'>, invitationId: Id<'invitations'>, now = Date.now()): Promise<ReferralOutcome> {
  let reason: Exclude<ReferralOutcome, 'rewarded'> | null = null;
  if (!(await isAdult(ctx, inviterId)) || !(await isAdult(ctx, inviteeId))) reason = 'not_adult';
  if (!reason) {
    const asInvitee = await ctx.db.query('referrals').withIndex('by_invitee', (q) => q.eq('inviteeId', inviteeId)).collect();
    if (asInvitee.some((r) => r.status === 'rewarded')) reason = 'invitee_already_rewarded';
  }
  if (!reason) {
    const reverse = await ctx.db.query('referrals').withIndex('by_invitee', (q) => q.eq('inviteeId', inviterId)).collect();
    if (reverse.some((r) => r.inviterId === inviteeId && r.status === 'rewarded')) reason = 'pair_already_rewarded';
  }
  if (!reason) {
    const recent = await ctx.db.query('referrals').withIndex('by_inviter', (q) => q.eq('inviterId', inviterId).gt('createdAt', now - YEAR_MS)).collect();
    if (recent.filter((r) => r.status === 'rewarded').length >= MAX_REWARDS_PER_YEAR) reason = 'inviter_limit';
  }
  // 13–15 en onbekende leeftijd: niets vastleggen over de minderjarige.
  if (reason === 'not_adult') return reason;
  const referralId = await ctx.db.insert('referrals', { inviterId, inviteeId, invitationId, status: reason ? 'not_eligible' : 'rewarded', reason: reason ?? undefined, createdAt: now });
  if (reason) return reason;
  await grantMonth(ctx, inviterId, referralId, now);
  await grantMonth(ctx, inviteeId, referralId, now);
  await audit(ctx, inviterId, 'referral.rewarded', referralId);
  return 'rewarded';
}

/** Voor het Premium-/uitnodigscherm: hoeveel beloningen dit jaar nog kunnen en tot wanneer een gift loopt. */
export const mine = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return null;
  const now = Date.now();
  const recent = await ctx.db.query('referrals').withIndex('by_inviter', (q) => q.eq('inviterId', uid).gt('createdAt', now - YEAR_MS)).collect();
  const used = recent.filter((r) => r.status === 'rewarded').length;
  const grant = await activeGrant(ctx, uid, now);
  return { rewardsThisYear: used, max: MAX_REWARDS_PER_YEAR, remaining: Math.max(0, MAX_REWARDS_PER_YEAR - used), days: REFERRAL_DAYS, grantUntil: grant?.expiresAt ?? null };
} });
