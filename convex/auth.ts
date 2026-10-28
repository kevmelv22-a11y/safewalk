import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import Google from '@auth/core/providers/google';
import { ConvexError } from 'convex/values';
import { query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

export const googleConfigured = () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Alleen terugsturen naar de eigen app (scheme), Expo-dev-URL's of de geconfigureerde SITE_URL. */
export function isAllowedRedirect(redirectTo: string, siteUrl = process.env.SITE_URL ?? '') {
  if (siteUrl && (redirectTo === siteUrl || redirectTo.startsWith(siteUrl.replace(/\/$/, '') + '/'))) return true;
  return /^safewalk:\/\//.test(redirectTo) || /^exp(s)?:\/\/[^\s]+$/.test(redirectTo);
}

/** Profiel + gratis abonnement voor ELKE nieuwe gebruiker (wachtwoord én Google). Idempotent. */
export async function ensureProfile(ctx: MutationCtx, userId: Id<'users'>, name: unknown) {
  if (!(await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', userId)).first()))
    await ctx.db.insert('profiles', { userId, displayName: String(name ?? '').slice(0, 80), defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: false, restricted: false });
  if (!(await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', userId)).first()))
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return { email: String(params.email).trim().toLowerCase(), name: String(params.name ?? '').slice(0, 80) };
      },
      validatePasswordRequirements(pw: string) {
        if (pw.length < 10) throw new ConvexError('WEAK_PASSWORD');
      },
    }),
    // Google alleen actief als AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET op de deployment staan
    ...(googleConfigured() ? [Google] : []),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      if (!isAllowedRedirect(redirectTo)) throw new Error(`Ongeldige redirectTo: ${redirectTo}`);
      return redirectTo;
    },
    async afterUserCreatedOrUpdated(ctx, { userId, profile }) {
      await ensureProfile(ctx as unknown as MutationCtx, userId, profile.name);
    },
  },
});

export const providers = query({ args: {}, handler: async () => ({ google: googleConfigured() }) });
