import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { acceptedContact, audit, displayName, fail, FREE_CONTACT_LIMIT, isBlockedBetween, isPremium, PREMIUM_CONTACT_LIMIT, randomToken, rateLimit, requireUser, revokeViewersFor, sha256Hex } from './lib';
import { getAuthUserId } from '@convex-dev/auth/server';

export const list = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return { mine: [], theirs: [], limit: FREE_CONTACT_LIMIT };
  const mine = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
  const theirs = await ctx.db.query('trustedContacts').withIndex('by_contact', (q) => q.eq('contactId', uid).eq('status', 'accepted')).collect();
  return {
    mine: await Promise.all(mine.map(async (c) => ({ id: c._id, userId: c.contactId, name: await displayName(ctx, c.contactId) }))),
    theirs: await Promise.all(theirs.map(async (c) => ({ id: c._id, userId: c.ownerId, name: await displayName(ctx, c.ownerId) }))),
    limit: (await isPremium(ctx, uid)) ? PREMIUM_CONTACT_LIMIT : FREE_CONTACT_LIMIT,
  };
} });

/** Geeft het token één keer terug; alleen de SHA-256-hash wordt opgeslagen. */
export const createInvitation = mutation({ args: {}, handler: async (ctx) => {
  const uid = await requireUser(ctx);
  await rateLimit(ctx, `invite:${uid}`, 20, 24 * 3600_000);
  if ((await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first())?.restricted) fail('RESTRICTED');
  const token = randomToken();
  await ctx.db.insert('invitations', { inviterId: uid, tokenHash: await sha256Hex(token), status: 'pending', expiresAt: Date.now() + 7 * 24 * 3600_000 });
  await audit(ctx, uid, 'invitation.created');
  return token;
} });

export const respondInvitation = mutation({ args: { token: v.string(), accept: v.boolean() }, handler: async (ctx, { token, accept }) => {
  const uid = await requireUser(ctx);
  await rateLimit(ctx, `invite-respond:${uid}`, 20, 3600_000); // tegen token-raden
  const hash = await sha256Hex(token);
  const i = await ctx.db.query('invitations').withIndex('by_hash', (q) => q.eq('tokenHash', hash)).first();
  if (!i || i.status !== 'pending' || i.expiresAt < Date.now()) fail('INVITATION_INVALID');
  if (i!.inviterId === uid) fail('INVITATION_SELF');
  if (await isBlockedBetween(ctx, i!.inviterId, uid)) fail('INVITATION_INVALID');
  if (accept) {
    if (!(await acceptedContact(ctx, i!.inviterId, uid))) {
      const count = (await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', i!.inviterId).eq('status', 'accepted')).collect()).length;
      const max = (await isPremium(ctx, i!.inviterId)) ? PREMIUM_CONTACT_LIMIT : FREE_CONTACT_LIMIT;
      if (count >= max) fail('CONTACT_LIMIT');
      const ex = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', i!.inviterId).eq('contactId', uid)).first();
      if (ex) await ctx.db.patch(ex._id, { status: 'accepted' });
      else await ctx.db.insert('trustedContacts', { ownerId: i!.inviterId, contactId: uid, status: 'accepted' });
    }
  }
  await ctx.db.patch(i!._id, { status: accept ? 'accepted' : 'declined', respondedBy: uid });
  await audit(ctx, uid, accept ? 'invitation.accepted' : 'invitation.declined', i!.inviterId);
  return i!.inviterId;
} });

/** Beide kanten kunnen de relatie beëindigen; lopende toegang wordt direct ingetrokken. */
export const remove = mutation({ args: { id: v.id('trustedContacts') }, handler: async (ctx, { id }) => {
  const uid = await requireUser(ctx);
  const tc = await ctx.db.get(id);
  if (!tc || (tc.ownerId !== uid && tc.contactId !== uid)) fail('NOT_FOUND');
  await ctx.db.patch(id, { status: 'removed' });
  await revokeViewersFor(ctx, tc!.ownerId, tc!.contactId);
  await audit(ctx, uid, 'contact.removed', id);
} });

export const block = mutation({ args: { userId: v.id('users') }, handler: async (ctx, { userId }) => {
  const uid = await requireUser(ctx);
  if (uid === userId) fail('BAD_REQUEST');
  if (!(await ctx.db.query('blocks').withIndex('by_pair', (q) => q.eq('blockerId', uid).eq('blockedId', userId)).first()))
    await ctx.db.insert('blocks', { blockerId: uid, blockedId: userId });
  for (const [o, c] of [[uid, userId], [userId, uid]] as const) {
    const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', o).eq('contactId', c)).first();
    if (tc && tc.status === 'accepted') await ctx.db.patch(tc._id, { status: 'removed' });
    await revokeViewersFor(ctx, o, c);
  }
  for (const i of await ctx.db.query('invitations').withIndex('by_inviter', (q) => q.eq('inviterId', userId)).collect())
    if (i.status === 'pending') await ctx.db.patch(i._id, { status: 'revoked' });
  await audit(ctx, uid, 'user.blocked');
} });

export const unblock = mutation({ args: { userId: v.id('users') }, handler: async (ctx, { userId }) => {
  const uid = await requireUser(ctx);
  const b = await ctx.db.query('blocks').withIndex('by_pair', (q) => q.eq('blockerId', uid).eq('blockedId', userId)).first();
  if (b) await ctx.db.delete(b._id);
} });

export const report = mutation({
  args: { userId: v.id('users'), reason: v.union(v.literal('stalking'), v.literal('harassment'), v.literal('spam'), v.literal('other')), details: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `report:${uid}`, 10, 24 * 3600_000);
    if (a.details && a.details.length > 2000) fail('BAD_REQUEST');
    await ctx.db.insert('abuseReports', { reporterId: uid, reportedId: a.userId, reason: a.reason, details: a.details, status: 'open' });
    await audit(ctx, uid, 'abuse.reported');
  },
});

export const blocked = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx); if (!uid) return [];
  const rows = await ctx.db.query('blocks').withIndex('by_pair', (q) => q.eq('blockerId', uid)).collect();
  return Promise.all(rows.map(async (b) => ({ userId: b.blockedId, name: await displayName(ctx, b.blockedId), since: b._creationTime })));
} });
