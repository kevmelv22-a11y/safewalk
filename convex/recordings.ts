import { httpAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, rateLimit, requireUser } from './lib';

/**
 * Opnames: Convex file storage + server ACL.
 * encryption 'none' = legacy plaintext (labeled).
 * encryption 'e2e-v1' = AES-256-GCM ciphertext; DEK never stored on server.
 * Envelopes hold wrapped DEKs for trusted app users only.
 */
export const MAX_CIPHERTEXT_BYTES = 19 * 1024 * 1024 + 64; // < Convex 20 MB HTTP body limit

const corsHeaders = (extra: Record<string, string> = {}) => ({
  'Access-Control-Allow-Origin': '*', // bearer-token auth, no cookies
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  ...extra,
});
const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders({ 'Content-Type': 'application/json' }) });

export const corsPreflight = httpAction(async () => new Response(null, { status: 204, headers: corsHeaders() }));

/** Validates + rate-limits an upload before any bytes are stored. */
export const checkUpload = internalMutation({
  args: { userId: v.id('users'), incidentId: v.optional(v.id('incidents')) },
  handler: async (ctx, a) => {
    await rateLimit(ctx, `rec-upload:${a.userId}`, 10, 60 * 60_000);
    if (a.incidentId) {
      const i = await ctx.db.get(a.incidentId);
      if (!i || i.userId !== a.userId) fail('FORBIDDEN');
    }
  },
});

/** Server-owned write: only callable from the upload proxy with a storageId it just created itself. */
export const insertFromUpload = internalMutation({
  args: {
    userId: v.id('users'), storageId: v.id('_storage'), mime: v.string(), clientUploadId: v.string(),
    plaintextByteSize: v.optional(v.number()), durationMs: v.optional(v.number()), incidentId: v.optional(v.id('incidents')),
  },
  handler: async (ctx, a) => {
    const meta = await ctx.db.system.get(a.storageId);
    if (!meta || meta.size < 28 || meta.size > MAX_CIPHERTEXT_BYTES) fail('BAD_REQUEST');
    if (await ctx.db.query('recordings').withIndex('by_storage', (q) => q.eq('storageId', a.storageId)).first()) fail('FORBIDDEN');
    if (a.incidentId) {
      const i = await ctx.db.get(a.incidentId);
      if (!i || i.userId !== a.userId) fail('FORBIDDEN');
    }
    const id = await ctx.db.insert('recordings', {
      userId: a.userId, storageId: a.storageId, mime: a.mime, byteSize: meta!.size,
      plaintextByteSize: a.plaintextByteSize, durationMs: a.durationMs, incidentId: a.incidentId,
      createdAt: Date.now(), encryption: 'e2e-v1', clientUploadId: a.clientUploadId,
    });
    await audit(ctx, a.userId, 'recording.upload', id, { bytes: meta!.size, encryption: 'e2e-v1' });
    return id;
  },
});

/** POST /recordings/upload — authenticated proxy (Bearer Convex auth token). e2e-v1 ciphertext only. */
export const uploadProxy = httpAction(async (ctx, req) => {
  const uid = await getAuthUserId(ctx);
  if (!uid) return jsonRes(401, { error: 'NOT_AUTHENTICATED' });
  const u = new URL(req.url);
  const p = (k: string) => u.searchParams.get(k) ?? undefined;
  const mime = p('mime') ?? '';
  const clientUploadId = p('clientUploadId') ?? '';
  if (p('encryption') !== 'e2e-v1') return jsonRes(400, { error: 'E2E_REQUIRED' });
  if (!/^audio\/[\w.+-]{1,40}$/.test(mime)) return jsonRes(400, { error: 'BAD_REQUEST' });
  if (!/^[A-Za-z0-9-]{8,80}$/.test(clientUploadId)) return jsonRes(400, { error: 'BAD_REQUEST' });
  const num = (k: string) => { const x = p(k); if (x == null) return undefined; const n = Number(x); return Number.isFinite(n) && n >= 0 && n < 1e10 ? n : NaN; };
  const plaintextByteSize = num('plaintextByteSize'); const durationMs = num('durationMs');
  if (Number.isNaN(plaintextByteSize) || Number.isNaN(durationMs)) return jsonRes(400, { error: 'BAD_REQUEST' });
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_CIPHERTEXT_BYTES) return jsonRes(413, { error: 'RECORDING_TOO_LARGE' });
  let incidentId: Id<'incidents'> | undefined;
  try {
    incidentId = p('incidentId') as Id<'incidents'> | undefined;
    await ctx.runMutation(internal.recordings.checkUpload, { userId: uid, incidentId });
  } catch (e) {
    const code = String((e as { data?: unknown }).data ?? (e as Error).message);
    return jsonRes(code.includes('RATE_LIMITED') ? 429 : 403, { error: code.includes('RATE_LIMITED') ? 'RATE_LIMITED' : 'FORBIDDEN' });
  }
  const body = await req.arrayBuffer();
  if (body.byteLength < 28) return jsonRes(400, { error: 'BAD_REQUEST' });
  if (body.byteLength > MAX_CIPHERTEXT_BYTES) return jsonRes(413, { error: 'RECORDING_TOO_LARGE' });
  // Upload intent BEFORE storing: the only provable record that a storage object is a recording upload.
  const intentId = await ctx.runMutation(internal.recordings.createUploadIntent, { userId: uid });
  const storageId = await ctx.storage.store(new Blob([body], { type: 'application/octet-stream' }));
  await ctx.runMutation(internal.recordings.attachUploadIntent, { intentId, storageId });
  try {
    const id = await ctx.runMutation(internal.recordings.insertFromUpload, {
      userId: uid, storageId, mime, clientUploadId, plaintextByteSize, durationMs, incidentId,
    });
    await ctx.runMutation(internal.recordings.completeUploadIntent, { intentId });
    return jsonRes(200, { id });
  } catch {
    await ctx.storage.delete(storageId); // no orphan on failed insert
    await ctx.runMutation(internal.recordings.completeUploadIntent, { intentId });
    return jsonRes(400, { error: 'BAD_REQUEST' });
  }
});

export const createUploadIntent = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => ctx.db.insert('recordingUploads', { userId, createdAt: Date.now() }),
});
export const attachUploadIntent = internalMutation({
  args: { intentId: v.id('recordingUploads'), storageId: v.id('_storage') },
  handler: async (ctx, { intentId, storageId }) => { await ctx.db.patch(intentId, { storageId }); },
});
export const completeUploadIntent = internalMutation({
  args: { intentId: v.id('recordingUploads') },
  handler: async (ctx, { intentId }) => { if (await ctx.db.get(intentId)) await ctx.db.delete(intentId); },
});

/** ACL check shared by the app blob proxy and getAccess. */
export const authorizeRead = internalQuery({
  args: { userId: v.id('users'), id: v.id('recordings') },
  handler: async (ctx, { userId, id }) => {
    const r = await ctx.db.get(id);
    if (!r || r.deletedAt) return null;
    if (r.userId !== userId) {
      const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', r.userId).eq('contactId', userId)).first();
      if (tc?.status !== 'accepted') return null;
      if ((r.encryption ?? 'none') === 'e2e-v1') {
        const env = await ctx.db.query('recordingKeyEnvelopes').withIndex('by_recording', (q) => q.eq('recordingId', id)).collect();
        if (!env.some((e) => e.recipientId === userId)) return null;
      }
    }
    return { storageId: r.storageId, byteSize: r.byteSize };
  },
});

/** GET /recordings/blob?id= — re-authorizes on every request; streams ciphertext, never a storage URL. */
export const blobProxy = httpAction(async (ctx, req) => {
  const uid = await getAuthUserId(ctx);
  if (!uid) return jsonRes(401, { error: 'NOT_AUTHENTICATED' });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  let ok: { storageId: Id<'_storage'>; byteSize: number } | null = null;
  try { ok = await ctx.runQuery(internal.recordings.authorizeRead, { userId: uid, id: id as Id<'recordings'> }); } catch { ok = null; }
  if (!ok) return jsonRes(404, { error: 'NOT_FOUND' });
  if (ok.byteSize > MAX_CIPHERTEXT_BYTES) return jsonRes(413, { error: 'TOO_LARGE' });
  const blob = await ctx.storage.get(ok.storageId);
  if (!blob) return jsonRes(404, { error: 'NOT_FOUND' });
  return new Response(blob, { status: 200, headers: corsHeaders({ 'Content-Type': 'application/octet-stream' }) });
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

/** Access metadata (no storage URL; bytes via /recordings/blob). Keys never returned by server. */
export const getAccess = mutation({
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
    let envelope: null | { ephemeralPubX25519: string; wrappedDek: string; recipientKeyId: string; version: number | null } = null;
    if (enc === 'e2e-v1' && r.userId !== uid) {
      const env = await ctx.db.query('recordingKeyEnvelopes')
        .withIndex('by_recording', (q) => q.eq('recordingId', id)).collect();
      const mine = env.find((e) => e.recipientId === uid);
      if (!mine) fail('E2E_ENVELOPE_MISSING');
      envelope = {
        ephemeralPubX25519: mine!.ephemeralPubX25519,
        wrappedDek: mine!.wrappedDek,
        recipientKeyId: mine!.recipientKeyId,
        version: mine!.version ?? null,
      };
    }
    return {
      blobPath: `/recordings/blob?id=${id}`, mime: r.mime, byteSize: r.byteSize,
      encryption: enc,
      clientUploadId: r.clientUploadId ?? null,
      ownerId: r.userId,
      isOwner: r.userId === uid,
      envelope,
      warning: enc === 'none'
        ? 'LEGACY_PLAINTEXT: opname is niet end-to-end versleuteld; server/storage kan bytes lezen bij ACL-toegang.'
        : 'E2E_V1: ciphertext op server; DEK niet op server. Intrekken stopt nieuwe downloads; wat al gedownload is, kan niet worden ingetrokken.',
    };
  },
});

/** Recordings van mensen die mij als vertrouwd contact hebben (recipient-pad). Geen sleutels. */
export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const envs = await ctx.db.query('recordingKeyEnvelopes').withIndex('by_recipient', (q) => q.eq('recipientId', uid)).collect();
    const out = [];
    for (const e of envs) {
      const r = await ctx.db.get(e.recordingId);
      if (!r || r.deletedAt) continue;
      const tc = await ctx.db.query('trustedContacts')
        .withIndex('by_pair', (q) => q.eq('ownerId', r.userId).eq('contactId', uid)).first();
      if (tc?.status !== 'accepted') continue;
      out.push({ id: r._id, ownerId: r.userId, createdAt: r.createdAt, byteSize: r.byteSize, recipientKeyId: e.recipientKeyId });
    }
    return out;
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
      version: v.optional(v.number()),
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
      if (e.version !== undefined && e.version !== 2) fail('BAD_REQUEST');
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
        wrappedDek: e.wrappedDek, createdAt: Date.now(), version: e.version === 2 ? 2 : undefined,
      });
      n++;
    }
    await audit(ctx, uid, 'recording.envelopes', a.recordingId, { count: n });
    return { saved: n };
  },
});

/**
 * Retention policy (docs/engineering.md §11): bounded, never touches live recordings.
 * 1. Rows soft-deleted > 30 days ago are hard-deleted (their file was already deleted at soft-delete).
 * 2. Envelopes whose recording is gone/deleted, or whose recipient is no longer an accepted contact, are deleted.
 * 3. Orphan files: ONLY files tracked by a recordingUploads intent (created by the upload proxy before
 *    storing) that are > 24 h old and unclaimed. Untracked/pre-existing storage is never deleted.
 * Each run handles at most BATCH items per category.
 */
const BATCH = 100;
export const SOFT_DELETE_GRACE_MS = 30 * 24 * 60 * 60_000;
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60_000;
export const retentionSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let rows = 0; let envs = 0; let orphans = 0;
    const expired = await ctx.db.query('recordings')
      .withIndex('by_deleted', (q) => q.gte('deletedAt', 0).lt('deletedAt', now - SOFT_DELETE_GRACE_MS)).take(BATCH);
    for (const r of expired) {
      if (await ctx.db.system.get(r.storageId)) await ctx.storage.delete(r.storageId);
      for (const e of await ctx.db.query('recordingKeyEnvelopes').withIndex('by_recording', (q) => q.eq('recordingId', r._id)).collect()) await ctx.db.delete(e._id);
      await ctx.db.delete(r._id); rows++;
    }
    for (const e of await ctx.db.query('recordingKeyEnvelopes').order('asc').take(BATCH * 5)) {
      if (envs >= BATCH) break;
      const r = await ctx.db.get(e.recordingId);
      const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', e.ownerId).eq('contactId', e.recipientId)).first();
      if (!r || r.deletedAt || tc?.status !== 'accepted') { await ctx.db.delete(e._id); envs++; }
    }
    // Only storage objects proven to be recording uploads (tracked intent) are ever deleted here.
    // Intents left behind (proxy crashed mid-upload) older than 24 h: delete their file if no recording claims it.
    const stale = await ctx.db.query('recordingUploads').withIndex('by_created', (q) => q.lt('createdAt', now - ORPHAN_MIN_AGE_MS)).take(BATCH);
    for (const it of stale) {
      if (it.storageId) {
        const ref = await ctx.db.query('recordings').withIndex('by_storage', (q) => q.eq('storageId', it.storageId!)).first();
        if (!ref && (await ctx.db.system.get(it.storageId))) { await ctx.storage.delete(it.storageId); orphans++; }
      }
      await ctx.db.delete(it._id);
    }
    return { rows, envs, orphans };
  },
});
