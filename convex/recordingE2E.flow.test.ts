/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import {
  sealCombined, openCombined, aadBytes, generateIdentityKeypair, unwrapDek, b64urlDecode, fromHex, toHex,
  wrapDekForRecipient, b64url, randomKey32, envelopeAadV2, encodeFragmentKey,
} from '../src/lib/recordingCrypto';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', {
      userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5,
      onboardingDone: true, restricted: false, birthYear: 1990, birthMonth: 1,
    });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

type T = ReturnType<typeof convexTest>;
type As = { fetch: (p: string, i?: RequestInit) => Promise<Response> };

async function upload(as: As, sealed: Uint8Array, cuid: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ encryption: 'e2e-v1', mime: 'audio/webm', clientUploadId: cuid, plaintextByteSize: '11', ...extra });
  return as.fetch(`/recordings/upload?${q}`, { method: 'POST', body: sealed.slice(), headers: { 'Content-Type': 'application/octet-stream' } });
}

async function setup(t: T) {
  const a = await user(t, 'anna');
  const b = await user(t, 'bram');
  const token = await a.as.mutation(api.contacts.createInvitation, {});
  await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
  const bk = generateIdentityKeypair();
  await b.as.mutation(api.deviceCrypto.registerPublicKey, { keyId: bk.keyId, publicKeyX25519: toHex(bk.publicKey) });
  return { a, b, bk };
}

const PLAIN = new TextEncoder().encode('audio-bytes');

describe('e2e-v1 recordings: full functional flow via HTTP proxies', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  test('owner uploads via auth proxy, plays back exact bytes; recipient decrypts v2 envelope; stranger blocked', async () => {
    const t = convexTest(schema, modules);
    const { a, b, bk } = await setup(t);
    const dek = randomKey32(); const cuid = 'upload-12345678';
    const sealed = sealCombined(PLAIN, dek, aadBytes(cuid, a.id));

    expect((await upload(t as unknown as As, sealed, cuid)).status).toBe(401); // unauthenticated
    expect((await upload(a.as, sealed, cuid, { encryption: 'none' })).status).toBe(400); // no plaintext uploads
    const res = await upload(a.as, sealed, cuid);
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const row = await t.run((ctx) => ctx.db.get(id as Id<'recordings'>));
    expect(row!.byteSize).toBe(sealed.length); // server-measured, not client-declared
    expect(row!.encryption).toBe('e2e-v1');

    // owner: blob proxy returns ciphertext only; decrypt with local DEK → exact plaintext
    const own = await a.as.fetch(`/recordings/blob?id=${id}`);
    expect(own.headers.get('cache-control')).toContain('no-store');
    const ownCt = new Uint8Array(await own.arrayBuffer());
    expect(ownCt).toEqual(sealed);
    const meta = await a.as.mutation(api.recordings.getAccess, { id });
    expect(openCombined(ownCt, dek, aadBytes(meta.clientUploadId!, meta.ownerId))).toEqual(PLAIN);

    // recipient before envelope: explicit error + blob denied
    await expect(b.as.mutation(api.recordings.getAccess, { id })).rejects.toThrow(/E2E_ENVELOPE_MISSING/);
    expect((await b.as.fetch(`/recordings/blob?id=${id}`)).status).toBe(404);

    const [k] = await a.as.query(api.deviceCrypto.contactPublicKeys, {});
    const aad = envelopeAadV2({ recordingId: id, clientUploadId: cuid, ownerId: a.id, recipientId: b.id, recipientKeyId: k!.keyId });
    const w = wrapDekForRecipient(dek, fromHex(k!.publicKeyX25519), aad);
    await a.as.mutation(api.recordings.putEnvelopes, { recordingId: id, envelopes: [{
      recipientId: b.id, recipientKeyId: k!.keyId, ephemeralPubX25519: toHex(w.ephemeralPublicKey), wrappedDek: b64url(w.wrapped), version: 2,
    }] });
    expect((await b.as.query(api.recordings.listSharedWithMe, {})).map((x) => x.id)).toEqual([id]);
    const bm = await b.as.mutation(api.recordings.getAccess, { id });
    expect(bm.envelope!.version).toBe(2);
    expect(JSON.stringify(bm)).not.toContain(toHex(dek));
    const bCt = new Uint8Array(await (await b.as.fetch(`/recordings/blob?id=${id}`)).arrayBuffer());
    const bAad = envelopeAadV2({ recordingId: id, clientUploadId: bm.clientUploadId!, ownerId: bm.ownerId, recipientId: b.id, recipientKeyId: bk.keyId });
    const rdek = unwrapDek(b64urlDecode(bm.envelope!.wrappedDek), fromHex(bm.envelope!.ephemeralPubX25519), bk.secretKey, bAad);
    expect(openCombined(bCt, rdek, aadBytes(bm.clientUploadId!, bm.ownerId))).toEqual(PLAIN);

    // envelope moved to another recording / recipient fails closed (AAD binding)
    const otherAad = envelopeAadV2({ recordingId: 'x' + id, clientUploadId: cuid, ownerId: a.id, recipientId: b.id, recipientKeyId: bk.keyId });
    expect(() => unwrapDek(b64urlDecode(bm.envelope!.wrappedDek), fromHex(bm.envelope!.ephemeralPubX25519), bk.secretKey, otherAad)).toThrow('DECRYPT_FAILED');
    expect(() => unwrapDek(b64urlDecode(bm.envelope!.wrappedDek), fromHex(bm.envelope!.ephemeralPubX25519), bk.secretKey)).toThrow('DECRYPT_FAILED');

    // stranger
    const c = await user(t, 'cees');
    expect((await c.as.fetch(`/recordings/blob?id=${id}`)).status).toBe(404);

    // revocation: contact removed → next blob request denied immediately
    await t.run(async (ctx) => {
      const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', a.id).eq('contactId', b.id)).first();
      await ctx.db.patch(tc!._id, { status: 'removed' });
    });
    expect((await b.as.fetch(`/recordings/blob?id=${id}`)).status).toBe(404);

    // delete → owner blob gone
    await a.as.mutation(api.recordings.remove, { id });
    expect((await a.as.fetch(`/recordings/blob?id=${id}`)).status).toBe(404);
  });

  test('legacy v1 (unbound) envelopes stay readable', async () => {
    const t = convexTest(schema, modules);
    const { a, b, bk } = await setup(t);
    const dek = randomKey32(); const cuid = 'upload-legacy01';
    const { id } = await (await upload(a.as, sealCombined(PLAIN, dek, aadBytes(cuid, a.id)), cuid)).json();
    const w = wrapDekForRecipient(dek, bk.publicKey);
    await a.as.mutation(api.recordings.putEnvelopes, { recordingId: id, envelopes: [{
      recipientId: b.id, recipientKeyId: bk.keyId, ephemeralPubX25519: toHex(w.ephemeralPublicKey), wrappedDek: b64url(w.wrapped),
    }] });
    const bm = await b.as.mutation(api.recordings.getAccess, { id });
    expect(bm.envelope!.version).toBeNull();
    const rdek = unwrapDek(b64urlDecode(bm.envelope!.wrappedDek), fromHex(bm.envelope!.ephemeralPubX25519), bk.secretKey);
    const ct = new Uint8Array(await (await b.as.fetch(`/recordings/blob?id=${id}`)).arrayBuffer());
    expect(openCombined(ct, rdek, aadBytes(cuid, a.id))).toEqual(PLAIN);
  });

  test('upload rejects foreign incident, bad mime, tiny body; no orphan storage left behind', async () => {
    const t = convexTest(schema, modules);
    const { a, b } = await setup(t);
    await b.as.mutation(api.security.setPin, { pin: '787878', confirmPin: '787878' });
    const inc = await b.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'x1', locationConsent: true, lat: 52.3, lng: 5.3, locationAt: Date.now(), torchRequested: false,
    });
    const sealed = sealCombined(PLAIN, randomKey32(), aadBytes('upload-abcdefgh', a.id));
    expect((await upload(a.as, sealed, 'upload-abcdefgh', { incidentId: inc.incidentId! })).status).toBe(403);
    expect((await upload(a.as, sealed, 'upload-abcdefgh', { mime: 'text/html' })).status).toBe(400);
    expect((await upload(a.as, new Uint8Array(10), 'upload-abcdefgh')).status).toBe(400);
    const files = await t.run((ctx) => ctx.db.system.query('_storage').collect());
    expect(files.length).toBe(0);
  });

  test('share-link proxy streams bytes, rechecks revoke each request, never exposes storage URLs, incident-scoped', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '787878', confirmPin: '787878' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u9', locationConsent: true, lat: 52.3, lng: 5.3, locationAt: Date.now(),
      torchRequested: false, createTrackingLink: true, shareRecordingScope: true,
    });
    const dek = randomKey32();
    const sealed = sealCombined(PLAIN, dek, aadBytes('upload-inc00001', a.id));
    const { id } = await (await upload(a.as, sealed, 'upload-inc00001', { incidentId: started.incidentId! })).json();
    const { id: noInc } = await (await upload(a.as, sealCombined(PLAIN, dek, aadBytes('upload-inc00002', a.id)), 'upload-inc00002')).json();
    const tok = started.shareToken!;

    const page = await t.fetch(`/track/recording-play?token=${tok}&id=${id}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).not.toMatch(/\/api\/storage\/|getUrl/);
    expect(html).toContain('/track/recording?token=');
    expect(html).not.toContain(encodeFragmentKey(dek)); // key never server-side

    const bytes = await t.fetch(`/track/recording?token=${tok}&id=${id}`);
    expect(bytes.headers.get('cache-control')).toContain('no-store');
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(sealed);
    expect((await t.fetch(`/track/recording?token=${tok}&id=${noInc}`)).status).toBe(404);
    expect(await t.query(internal.tracking.resolveRecordingMeta, { token: tok, recordingId: noInc })).toBeNull();

    const link = await t.run((ctx) => ctx.db.query('shareLinks').first());
    await a.as.mutation(api.tracking.revokeShareLink, { id: link!._id });
    expect((await t.fetch(`/track/recording?token=${tok}&id=${id}`)).status).toBe(404);
    expect((await t.fetch(`/track/recording-play?token=${tok}&id=${id}`)).status).toBe(404);
  });

  test('retention: soft-deleted rows, stale envelopes, tracked abandoned uploads only; unrelated storage untouched', async () => {
    const t = convexTest(schema, modules);
    const { a, b, bk } = await setup(t);
    const dek = randomKey32();
    const { id: live } = await (await upload(a.as, sealCombined(PLAIN, dek, aadBytes('upload-live0001', a.id)), 'upload-live0001')).json();
    const { id: old } = await (await upload(a.as, sealCombined(PLAIN, dek, aadBytes('upload-old00001', a.id)), 'upload-old00001')).json();
    const w = wrapDekForRecipient(dek, bk.publicKey);
    await a.as.mutation(api.recordings.putEnvelopes, { recordingId: live, envelopes: [{
      recipientId: b.id, recipientKeyId: bk.keyId, ephemeralPubX25519: toHex(w.ephemeralPublicKey), wrappedDek: b64url(w.wrapped),
    }] });
    await a.as.mutation(api.recordings.remove, { id: old });
    await t.run((ctx) => ctx.db.patch(old, { deletedAt: Date.now() - 31 * 24 * 3600_000 }));
    // successful uploads leave no intents behind
    expect(await t.run((ctx) => ctx.db.query('recordingUploads').collect())).toHaveLength(0);
    // abandoned tracked upload (proxy crashed after store) vs. unrelated untracked file
    const abandoned = await t.run(async (ctx) => {
      const sid = await ctx.storage.store(new Blob(['ct-abandoned']));
      await ctx.db.insert('recordingUploads', { userId: a.id, storageId: sid, createdAt: Date.now() });
      return sid;
    });
    const unrelated = await t.run((ctx) => ctx.storage.store(new Blob(['not a recording'])));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    await t.run(async (ctx) => {
      const tc = await ctx.db.query('trustedContacts').withIndex('by_pair', (q) => q.eq('ownerId', a.id).eq('contactId', b.id)).first();
      await ctx.db.patch(tc!._id, { status: 'removed' });
    });
    const r = await t.mutation(internal.recordings.retentionSweep, {});
    vi.useRealTimers();
    expect(r).toEqual({ rows: 1, envs: 1, orphans: 1 });
    expect(await t.run((ctx) => ctx.db.get(old))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(abandoned))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(unrelated))).toBeTruthy();
    expect(await t.run((ctx) => ctx.db.query('recordingUploads').collect())).toHaveLength(0);
    const liveRow = await t.run((ctx) => ctx.db.get(live as Id<'recordings'>));
    expect(await t.run((ctx) => ctx.db.system.get(liveRow!.storageId))).toBeTruthy();
  });

  test('upload > 19 MB cap is denied with 413 and stores nothing', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const res = await upload(a.as, new Uint8Array(19 * 1024 * 1024 + 65), 'upload-big00001');
    expect(res.status).toBe(413);
    expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(0);
  });
});
