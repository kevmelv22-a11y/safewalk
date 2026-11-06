const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
const mockRandom = jest.fn((n: number) => require('crypto').randomBytes(n) as Uint8Array);
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(mockRandom(n)),
  randomUUID: () => `uuid-${++mockUuid}-0000`,
}));
const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...p: unknown[]) { this.uri = p.map((x) => (typeof x === 'string' ? x : 'cache')).join('/'); }
    get exists() { return true; }
    create() {}
    list() { return [...mockFiles.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(k)); }
  }
  class File {
    get name() { return this.uri.split('/').pop()!; }
    uri: string;
    constructor(...p: unknown[]) { this.uri = p.map((x) => (typeof x === 'string' ? x : 'cache')).join('/'); }
    create() { mockFiles.set(this.uri, new Uint8Array()); }
    async write(b: Uint8Array) { mockFiles.set(this.uri, b); }
    get exists() { return mockFiles.has(this.uri); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { File, Directory, Paths: { cache: 'cache' } };
});

import { Platform } from 'react-native';
import {
  sealRecording, decryptDownload, buildEnvelopesForContacts, registerMyPublicKey, postCiphertext, fetchCiphertext,
} from '../src/lib/recordingUpload';
import { storeLocalDek, getIdentityKeypair, pinContactKey } from '../src/lib/recordingKeys';
import { generateIdentityKeypair, toHex } from '../src/lib/recordingCrypto';
import { materializePlaintext, deleteLocalOriginal, cleanupPlaybackLeftovers } from '../src/lib/playbackFile';

const PLAIN = new TextEncoder().encode('hello audio');

beforeEach(() => { mockStore.clear(); mockFiles.clear(); mockRandom.mockClear(); });

test('native uses expo-crypto as CSPRNG (no global polyfill)', () => {
  expect(Platform.OS).not.toBe('web');
  sealRecording(PLAIN, 'owner1');
  expect(mockRandom).toHaveBeenCalled();
});

test('owner round trip through decryptDownload with local DEK; no plaintext fallback on tamper', async () => {
  const { dek, sealed, clientUploadId } = sealRecording(PLAIN, 'owner1');
  await storeLocalDek('rec1', dek);
  const meta = { encryption: 'e2e-v1' as const, clientUploadId, ownerId: 'owner1', isOwner: true, envelope: null };
  expect(await decryptDownload({ ...meta, ciphertext: sealed, recordingId: 'rec1', myUserId: 'owner1' })).toEqual(PLAIN);
  const bad = sealed.slice(); bad[bad.length - 1] ^= 1;
  await expect(decryptDownload({ ...meta, ciphertext: bad, recordingId: 'rec1', myUserId: 'owner1' })).rejects.toThrow('DECRYPT_FAILED');
  await expect(decryptDownload({ ...meta, ciphertext: sealed, recordingId: 'other', myUserId: 'owner1' })).rejects.toThrow('DEK_MISSING');
});

test('recipient v2 envelope round trip; key mismatch / no key explicit errors', async () => {
  const reg = jest.fn(async () => ({}));
  await expect(decryptDownload({ encryption: 'e2e-v1', clientUploadId: 'c', ownerId: 'o', isOwner: false, recordingId: 'r', myUserId: 'me', ciphertext: new Uint8Array(40),
    envelope: { ephemeralPubX25519: '00', wrappedDek: 'AA', recipientKeyId: 'x', version: 2 } })).rejects.toThrow('E2E_NO_LOCAL_KEY');
  const kp = await registerMyPublicKey(reg);
  expect(kp.created).toBe(true);
  expect(reg).toHaveBeenLastCalledWith(expect.objectContaining({ revokePrevious: true }));
  // second call must NOT rotate silently
  const again = await registerMyPublicKey(reg);
  expect(again.keyId).toBe(kp.keyId);
  expect(reg).toHaveBeenLastCalledWith(expect.objectContaining({ revokePrevious: false }));

  const { dek, sealed, clientUploadId } = sealRecording(PLAIN, 'owner1');
  const { envelopes } = await buildEnvelopesForContacts({ dek, recordingId: 'rec9', clientUploadId, ownerId: 'owner1',
    contacts: [{ userId: 'me', keyId: kp.keyId, publicKeyX25519: toHex(kp.publicKey) }] });
  const env = { ...envelopes[0]!, version: 2 };
  const base = { encryption: 'e2e-v1' as const, clientUploadId, ownerId: 'owner1', isOwner: false, myUserId: 'me', ciphertext: sealed };
  expect(await decryptDownload({ ...base, recordingId: 'rec9', envelope: env })).toEqual(PLAIN);
  await expect(decryptDownload({ ...base, recordingId: 'rec10', envelope: env })).rejects.toThrow('DECRYPT_FAILED');
  await expect(decryptDownload({ ...base, recordingId: 'rec9', envelope: { ...env, recipientKeyId: 'ffffffffffffffff' } })).rejects.toThrow('E2E_KEY_MISMATCH');
  // explicit rotation replaces key
  const rotated = await registerMyPublicKey(reg, { rotate: true });
  expect(rotated.keyId).not.toBe(kp.keyId);
  expect((await getIdentityKeypair())!.keyId).toBe(rotated.keyId);
});

test('pinned contact key change blocks wrapping for that contact', async () => {
  const good = generateIdentityKeypair(); const evil = generateIdentityKeypair();
  await pinContactKey('u2', toHex(good.publicKey));
  const { dek, clientUploadId } = sealRecording(PLAIN, 'owner1');
  const r = await buildEnvelopesForContacts({ dek, recordingId: 'r', clientUploadId, ownerId: 'owner1', contacts: [
    { userId: 'u2', keyId: evil.keyId, publicKeyX25519: toHex(evil.publicKey), displayName: 'Bram' },
    { userId: 'u3', keyId: good.keyId, publicKeyX25519: toHex(good.publicKey) },
  ] });
  expect(r.skipped).toEqual(['Bram']);
  expect(r.envelopes.map((e) => e.recipientId)).toEqual(['u3']);
});

test('postCiphertext / fetchCiphertext send bearer auth and surface server errors', async () => {
  const f = jest.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ id: 'rec1' }), { status: 200 }));
  const r = await postCiphertext({ authToken: 'tok', sealed: new Uint8Array(30), mime: 'audio/m4a', clientUploadId: 'cuid-12345', plaintextByteSize: 2, fetchImpl: f as never, site: 'https://s' });
  expect(r.id).toBe('rec1');
  expect(f.mock.calls[0]![0]).toMatch(/^https:\/\/s\/recordings\/upload\?encryption=e2e-v1/);
  expect((f.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  const g = jest.fn(async () => new Response('{"error":"RATE_LIMITED"}', { status: 429 }));
  await expect(postCiphertext({ authToken: 'tok', sealed: new Uint8Array(30), mime: 'audio/m4a', clientUploadId: 'cuid-12345', plaintextByteSize: 2, fetchImpl: g as never, site: 'https://s' })).rejects.toThrow('RATE_LIMITED');
  const h = jest.fn(async () => new Response('', { status: 404 }));
  await expect(fetchCiphertext('rec1', 'tok', h as never, 'https://s')).rejects.toThrow('NOT_FOUND');
});

test('native playback temp file is created and deleted on dispose; recorder original deleted', async () => {
  const m = await materializePlaintext(PLAIN, 'audio/m4a');
  expect(m.uri).toMatch(/\.m4a$/);
  expect(mockFiles.get(m.uri)).toEqual(PLAIN);
  m.dispose(); m.dispose();
  expect(mockFiles.has(m.uri)).toBe(false);
  mockFiles.set('file:///rec.m4a', PLAIN);
  deleteLocalOriginal('file:///rec.m4a');
  expect(mockFiles.size).toBe(0);
});

test('size cap enforced before encryption', () => {
  expect(() => sealRecording(new Uint8Array(19 * 1024 * 1024 + 1), 'o')).toThrow('RECORDING_TOO_LARGE');
});

test('next-launch cleanup only removes sw-play-* in the app playback dir', () => {
  mockFiles.set('cache/safewalk-playback/sw-play-abc-1.m4a', PLAIN);
  mockFiles.set('cache/safewalk-playback/other.txt', PLAIN);
  mockFiles.set('cache/sw-play-outside.m4a', PLAIN);
  mockFiles.set('cache/unrelated.jpg', PLAIN);
  expect(cleanupPlaybackLeftovers()).toBe(1);
  expect([...mockFiles.keys()].sort()).toEqual(['cache/safewalk-playback/other.txt', 'cache/sw-play-outside.m4a', 'cache/unrelated.jpg']);
});
