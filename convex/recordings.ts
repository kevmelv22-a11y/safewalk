import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, rateLimit, requireUser } from './lib';

/**
 * Opnames: Convex file storage + server ACL.
 * Transit: TLS. At-rest: platform storage (géén claim van client-side E2E-encryptie).
 * Alleen eigenaar + geaccepteerde trusted contacts mogen downloaden.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `rec-upload:${uid}`, 10, 60 * 60_000);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalize = mutation({
  args: {
    storageId: v.id('_storage'),
    mime: v.string(),
    byteSize: v.number(),
    durationMs: v.optional(v.number()),
    incidentId: v.optional(v.id('incidents')),
    alertId: v.optional(v.id('alerts')),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `rec-fin:${uid}`, 10, 60 * 60_000);
    if (a.byteSize <= 0 || a.byteSize > 25 * 1024 * 1024) fail('BAD_REQUEST');
    if (!/^audio\//.test(a.mime) && a.mime !== 'application/octet-stream') fail('BAD_REQUEST');
    if (a.incidentId) {
      const i = await ctx.db.get(a.incidentId);
      if (!i || i.userId !== uid) fail('FORBIDDEN');
    }
    if (a.alertId) {
      const al = await ctx.db.get(a.alertId);
      if (!al || al.userId !== uid) fail('FORBIDDEN');
    }
    const id = await ctx.db.insert('recordings', {
      userId: uid, storageId: a.storageId, mime: a.mime, byteSize: a.byteSize,
      durationMs: a.durationMs, incidentId: a.incidentId, alertId: a.alertId, createdAt: Date.now(),
    });
    await audit(ctx, uid, 'recording.finalize', id, { bytes: a.byteSize });
    return { id };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const rows = await ctx.db.query('recordings').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    return rows.filter((r) => !r.deletedAt).map((r) => ({
      id: r._id, createdAt: r.createdAt, byteSize: r.byteSize, durationMs: r.durationMs ?? null,
      mime: r.mime, incidentId: r.incidentId ?? null,
    }));
  },
});

export const remove = mutation({
  args: { id: v.id('recordings') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== uid) fail('NOT_FOUND');
    const r = row!;
    await ctx.storage.delete(r.storageId).catch(() => {});
    await ctx.db.patch(id, { deletedAt: Date.now() });
    await audit(ctx, uid, 'recording.delete', id);
  },
});

/** Tijdelijke download-URL voor eigenaar of trusted contact. */
export const getDownloadUrl = mutation({
  args: { id: v.id('recordings') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `rec-dl:${uid}`, 30, 60 * 60_000);
    const row = await ctx.db.get(id);
    if (!row || row.deletedAt) fail('NOT_FOUND');
    const r = row!;
    let allowed = r.userId === uid;
    if (!allowed) {
      const tc = await ctx.db
        .query('trustedContacts')
        .withIndex('by_pair', (q) => q.eq('ownerId', r.userId).eq('contactId', uid))
        .first();
      allowed = tc?.status === 'accepted';
    }
    if (!allowed) fail('FORBIDDEN');
    const url = await ctx.storage.getUrl(r.storageId);
    if (!url) fail('NOT_FOUND');
    return { url, mime: r.mime, byteSize: r.byteSize };
  },
});
