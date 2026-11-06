import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, displayName, fail, rateLimit, requireUser } from './lib';

/** Registreer/roteer device X25519 public key (authenticated). Private key never uploaded. */
export const registerPublicKey = mutation({
  args: { keyId: v.string(), publicKeyX25519: v.string(), revokePrevious: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `devcrypto:${uid}`, 20, 60 * 60_000);
    if (!/^[0-9a-f]{16}$/.test(a.keyId)) fail('BAD_REQUEST');
    if (!/^[0-9a-f]{64}$/.test(a.publicKeyX25519)) fail('BAD_REQUEST');
    if (a.revokePrevious) {
      const prev = await ctx.db.query('deviceCryptoKeys').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
      for (const p of prev) {
        if (!p.revokedAt) await ctx.db.patch(p._id, { revokedAt: Date.now() });
      }
    }
    const existing = await ctx.db.query('deviceCryptoKeys')
      .withIndex('by_user_key', (q) => q.eq('userId', uid).eq('keyId', a.keyId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { publicKeyX25519: a.publicKeyX25519, revokedAt: undefined });
    } else {
      await ctx.db.insert('deviceCryptoKeys', {
        userId: uid, keyId: a.keyId, publicKeyX25519: a.publicKeyX25519, createdAt: Date.now(),
      });
    }
    await audit(ctx, uid, 'crypto.pubkey_register', undefined, { keyId: a.keyId, rotated: !!a.revokePrevious });
    return { ok: true as const };
  },
});

export const myPublicKeys = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    return (await ctx.db.query('deviceCryptoKeys').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      .filter((k) => !k.revokedAt)
      .map((k) => ({ keyId: k.keyId, publicKeyX25519: k.publicKeyX25519, createdAt: k.createdAt }));
  },
});

/** Actieve public keys van geaccepteerde trusted contacts (voor wrap). */
export const contactPublicKeys = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const contacts = await ctx.db.query('trustedContacts')
      .withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    const out: { userId: string; keyId: string; publicKeyX25519: string; displayName: string | null }[] = [];
    for (const c of contacts) {
      const keys = await ctx.db.query('deviceCryptoKeys').withIndex('by_user', (q) => q.eq('userId', c.contactId)).collect();
      const active = keys.filter((k) => !k.revokedAt).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (active) out.push({ userId: c.contactId, keyId: active.keyId, publicKeyX25519: active.publicKeyX25519, displayName: (await displayName(ctx, c.contactId)) ?? null });
    }
    return out;
  },
});
