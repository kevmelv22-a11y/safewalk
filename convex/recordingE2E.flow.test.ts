/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import {
  sealCombined, openCombined, aadBytes, generateIdentityKeypair, unwrapDek, b64urlDecode, fromHex, toHex,
} from '../src/lib/recordingCrypto';
import { wrapDekForRecipient, b64url, randomKey32 } from '../src/lib/recordingCrypto';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', {
      userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5,
      onboardingDone: true, restricted: false,
    });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

describe('e2e-v1 recordings: server-side flow', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());
  test('owner seals, recipient fetches envelope + ciphertext and decrypts; AAD bound', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const token = await a.as.mutation(api.contacts.createInvitation, {});
    await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    const bk = generateIdentityKeypair();
    await b.as.mutation(api.deviceCrypto.registerPublicKey, { keyId: bk.keyId, publicKeyX25519: toHex(bk.publicKey) });
    const keys = await a.as.query(api.deviceCrypto.contactPublicKeys, {});
    expect(keys.map((k) => k.keyId)).toEqual([bk.keyId]);

    const dek = randomKey32();
    const cuid = 'upload-12345678';
    const plain = new TextEncoder().encode('audio-bytes');
    const sealed = sealCombined(plain, dek, aadBytes(cuid, a.id));
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([sealed.slice()])));
    const { id } = await a.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: sealed.length, encryption: 'e2e-v1', clientUploadId: cuid,
    });
    // recipient without envelope -> explicit error
    await expect(b.as.mutation(api.recordings.getDownloadUrl, { id })).rejects.toThrow(/E2E_ENVELOPE_MISSING/);
    const w = wrapDekForRecipient(dek, fromHex(keys[0]!.publicKeyX25519));
    await a.as.mutation(api.recordings.putEnvelopes, { recordingId: id, envelopes: [{
      recipientId: b.id, recipientKeyId: bk.keyId, ephemeralPubX25519: toHex(w.ephemeralPublicKey), wrappedDek: b64url(w.wrapped),
    }] });
    const shared = await b.as.query(api.recordings.listSharedWithMe, {});
    expect(shared.map((s) => s.id)).toEqual([id]);
    const meta = await b.as.mutation(api.recordings.getDownloadUrl, { id });
    expect(JSON.stringify(meta)).not.toContain(toHex(dek));
    const ct = new Uint8Array(await t.run(async (ctx) => Array.from(new Uint8Array(await (await ctx.storage.get(storageId))!.arrayBuffer()))));
    const rdek = unwrapDek(b64urlDecode(meta.envelope!.wrappedDek), fromHex(meta.envelope!.ephemeralPubX25519), bk.secretKey);
    expect(new TextDecoder().decode(openCombined(ct, rdek, aadBytes(meta.clientUploadId!, meta.ownerId)))).toBe('audio-bytes');
    // wrong owner/upload binding fails closed
    expect(() => openCombined(ct, rdek, aadBytes(meta.clientUploadId!, b.id))).toThrow('DECRYPT_FAILED');
    // stranger cannot put envelope for non-contact
    const c = await user(t, 'cees');
    await expect(a.as.mutation(api.recordings.putEnvelopes, { recordingId: id, envelopes: [{
      recipientId: c.id, recipientKeyId: bk.keyId, ephemeralPubX25519: toHex(w.ephemeralPublicKey), wrappedDek: b64url(w.wrapped),
    }] })).rejects.toThrow(/FORBIDDEN/);
    // delete removes envelopes; shared list empties
    await a.as.mutation(api.recordings.remove, { id });
    expect(await b.as.query(api.recordings.listSharedWithMe, {})).toEqual([]);
  });

  test('finalize rejects size mismatch and re-claiming the same storage object', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(40)])));
    await expect(a.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: 41, encryption: 'e2e-v1', clientUploadId: 'abcdefgh1',
    })).rejects.toThrow(/BAD_REQUEST/);
    await a.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: 40, encryption: 'e2e-v1', clientUploadId: 'abcdefgh1',
    });
    await expect(b.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: 40, encryption: 'e2e-v1', clientUploadId: 'abcdefgh2',
    })).rejects.toThrow(/FORBIDDEN/);
  });

  test('share-link player meta only exposes recordings of the link incident', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '787878', confirmPin: '787878' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u9', locationConsent: true, lat: 52.3, lng: 5.3, locationAt: Date.now(),
      torchRequested: false, createTrackingLink: true, shareRecordingScope: true,
    });
    const s1 = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(30)])));
    const s2 = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(30)])));
    const inInc = await a.as.mutation(api.recordings.finalize, { storageId: s1, mime: 'audio/webm', byteSize: 30, incidentId: started.incidentId!, encryption: 'e2e-v1', clientUploadId: 'abcdefgh3' });
    const noInc = await a.as.mutation(api.recordings.finalize, { storageId: s2, mime: 'audio/webm', byteSize: 30, encryption: 'e2e-v1', clientUploadId: 'abcdefgh4' });
    expect(await t.query(internal.tracking.resolveRecordingMeta, { token: started.shareToken!, recordingId: inInc.id })).toBeTruthy();
    expect(await t.query(internal.tracking.resolveRecordingMeta, { token: started.shareToken!, recordingId: noInc.id })).toBeNull();
  });
});
