import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { ConvexError } from 'convex/values';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      return { email: String(params.email).trim().toLowerCase(), name: String(params.name ?? '').slice(0, 80) };
    },
    validatePasswordRequirements(pw: string) {
      if (pw.length < 10) throw new ConvexError('WEAK_PASSWORD');
    },
  })],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId, profile }) {
      if (existingUserId) return;
      await ctx.db.insert('profiles', { userId, displayName: String(profile.name ?? ''), defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: false, restricted: false });
      await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    },
  },
});
