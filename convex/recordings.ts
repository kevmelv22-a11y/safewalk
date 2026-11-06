import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, rateLimit, requireUser } from './lib';

/**
 * Opnames: Convex file storage + server ACL.
 * encryption 'none' = legacy plaintext (labeled).
 * encryption 'e2e-v1' = AES-256-GCM ciphertext; DEK never stored on server.
 * Envelopes hold wrapped DEKs for trusted app users only.
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
    encryption: v.optional(v.union(v.literal('none'), v.literal('e2e-v1'))),
    clientUploadId: v.optional(v.string()),
    plaintextByteSize: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `rec-fin:${uid}`, 10, 60 * 60_000);
    if (a.byteSize <= 0 || a.byteSize > 25 * 1024 * 1024) fail('BAD_REQUEST');
    const enc = a.encryption ?? 'none';
    if (enc === 'none') {
      if (!/^audio\//.test(a.mime) && a.mime !== 'application/octet-stream') fail('BAD_REQUEST');
    } else {
      // ciphertext mime
      if (a.mime !== 'application/octet-stream' && !/^audio\//.test(a.mime)) fail('BAD_REQUEST');
      if (!a.clientUploadId || a.clientUploadId.length < 8 || a.clientUploadId.length > 80) fail('BAD_REQUEST');
    }
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
      plaintextByteSize: a.plaintextByteSize, durationMs: a.durationMs,
      incidentId: a.incidentId, alertId: a.alertId, createdAt: Date.now(),
      encryption: enc, clientUploadId: a.clientUploadId,
    });
    await audit(ctx, uid, 'recording.finalize', id, { bytes: a.byteSize, encryption: enc });
    return { id, encryption: enc };
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
      encryption: (r.encryption ?? 'none') as 'none' | 'e2e-v1',
      clientUploadId: r.clientUploadId ?? null,
      plaintextByteSize: r.plaintextByteSize ?? null,
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
    try { await ctx.storage.delete(r.storageId); } catch { /* */ }
    const envs = await ctx.db.query('recordingKeyEnvelopes').withIndex('by_recording', (q) => q.eq('recordingId', id)).collect();
    for (const e of envs) await ctx.db.delete(e._id);
    await ctx.db.patch(id, { deletedAt: Date.now() });
    await audit(ctx, uid, 'recording.delete', id);
    return { deleted: true as const };
  },
});

/** Tijdelijke download-URL + encryption metadata. Keys never returned by server. */
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
      const tc = await ctx.db.query('trustedContacts')
        .withIndex('by_pair', (q) => q.eq('ownerId', r.userId).eq('contactId', uid)).first();
      allowed = tc?.status === 'accepted';
    }
    if (!allowed) fail('FORBIDDEN');
    const enc = (r.encryption ?? 'none') as 'none' | 'e2e-v1';
    // E2E: recipients need an envelope (except owner who uses local DEK)
    let envelope: null | { ephemeralPubX25519: string; wrappedDek: string; recipientKeyId: string } = null;
    if (enc === 'e2e-v1' && r.userId !== uid) {
      const env = await ctx.db.query('recordingKeyEnvelopes')
        .withIndex('by_recording', (q) => q.eq('recordingId', id)).collect();
      const mine = env.find((e) => e.recipientId === uid);
      if (!mine) fail('E2E_ENVELOPE_MISSING');
      envelope = {
        ephemeralPubX25519: mine!.ephemeralPubX25519,
        wrappedDek: mine!.wrappedDek,
        recipientKeyId: mine!.recipientKeyId,
      };
    }
    const url = await ctx.storage.getUrl(r.storageId);
    if (!url) fail('NOT_FOUND');
    return {
      url, mime: r.mime, byteSize: r.byteSize, temporary: true as const,
      encryption: enc,
      clientUploadId: r.clientUploadId ?? null,
      ownerId: r.userId,
      isOwner: r.userId === uid,
      envelope,
      warning: enc === 'none'
        ? 'LEGACY_PLAINTEXT: opname is niet end-to-end versleuteld; server/storage kan bytes lezen bij ACL-toegang.'
        : 'E2E_V1: ciphertext op server; DEK niet op server. Intrekken stopt nieuwe downloads, niet reeds gedownloade kopieën.',
    };
  },
});

/** Owner wraps DEK for trusted contacts (client supplies wrapped blobs; server never sees DEK). */
export const putEnvelopes = mutation({
  args: {
    recordingId: v.id('recordings'),
    envelopes: v.array(v.object({
      recipientId: v.id('users'),
      recipientKeyId: v.string(),
      ephemeralPubX25519: v.string(),
      wrappedDek: v.string(),
    })),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `rec-env:${uid}`, 30, 60 * 60_000);
    const row = await ctx.db.get(a.recordingId);
    if (!row || row.userId !== uid || row.deletedAt) fail('NOT_FOUND');
    const rec = row!;
    if ((rec.encryption ?? 'none') !== 'e2e-v1') fail('NOT_E2E');
    if (a.envelopes.length > 20) fail('BAD_REQUEST');
    let n = 0;
    for (const e of a.envelopes) {
      if (!/^[0-9a-f]{64}$/.test(e.ephemeralPubX25519)) fail('BAD_REQUEST');
      if (!/^[0-9a-f]{16}$/.test(e.recipientKeyId)) fail('BAD_REQUEST');
      if (e.wrappedDek.length < 20 || e.wrappedDek.length > 2000) fail('BAD_REQUEST');
      const tc = await ctx.db.query('trustedContacts')
        .withIndex('by_pair', (q) => q.eq('ownerId', uid).eq('contactId', e.recipientId)).first();
      if (!tc || tc.status !== 'accepted') fail('FORBIDDEN');
      // replace existing envelope for pair
      const existing = await ctx.db.query('recordingKeyEnvelopes')
        .withIndex('by_recording', (q) => q.eq('recordingId', a.recordingId)).collect();
      for (const old of existing.filter((x) => x.recipientId === e.recipientId)) await ctx.db.delete(old._id);
      await ctx.db.insert('recordingKeyEnvelopes', {
        recordingId: a.recordingId, ownerId: uid, recipientId: e.recipientId,
        recipientKeyId: e.recipientKeyId, ephemeralPubX25519: e.ephemeralPubX25519,
        wrappedDek: e.wrappedDek, createdAt: Date.now(),
      });
      n++;
    }
    await audit(ctx, uid, 'recording.envelopes', a.recordingId, { count: n });
    return { saved: n };
  },
});
