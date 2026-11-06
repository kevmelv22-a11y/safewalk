import { afterEach, describe, expect, it, test } from 'vitest';
import {
  sealCombined, openCombined, wrapDekForRecipient, unwrapDek,
  generateIdentityKeypair, encodeFragmentKey, parseFragmentKey,
  aadBytes, randomKey32, E2E_MODE,
  setRandomSource, secureRandom, keyFingerprint, envelopeAadV2,
} from '../src/lib/recordingCrypto';

describe('recordingCrypto e2e-v1', () => {
  it('roundtrips AES-GCM with AAD', () => {
    const key = randomKey32();
    const pt = new TextEncoder().encode('alarm-audio-bytes');
    const aad = aadBytes('upload-1', 'user-1');
    const sealed = sealCombined(pt, key, aad);
    const out = openCombined(sealed, key, aad);
    expect(new TextDecoder().decode(out)).toBe('alarm-audio-bytes');
  });

  it('tamper detection / wrong key / wrong aad fail', () => {
    const key = randomKey32();
    const pt = new Uint8Array([1, 2, 3, 4, 5]);
    const aad = aadBytes('u', 'owner');
    const sealed = sealCombined(pt, key, aad);
    const bad = new Uint8Array(sealed);
    bad[20] ^= 0xff;
    expect(() => openCombined(bad, key, aad)).toThrow(/DECRYPT_FAILED/);
    expect(() => openCombined(sealed, randomKey32(), aad)).toThrow(/DECRYPT_FAILED/);
    expect(() => openCombined(sealed, key, aadBytes('u', 'other'))).toThrow(/DECRYPT_FAILED/);
  });

  it('X25519 envelope wrap/unwrap', () => {
    const recipient = generateIdentityKeypair();
    const dek = randomKey32();
    const { ephemeralPublicKey, wrapped } = wrapDekForRecipient(dek, recipient.publicKey);
    const out = unwrapDek(wrapped, ephemeralPublicKey, recipient.secretKey);
    expect(Array.from(out)).toEqual(Array.from(dek));
    const other = generateIdentityKeypair();
    expect(() => unwrapDek(wrapped, ephemeralPublicKey, other.secretKey)).toThrow();
  });

  it('fragment key encode/parse never needs query', () => {
    const dek = randomKey32();
    const frag = encodeFragmentKey(dek);
    expect(frag.startsWith('#k=v1.')).toBe(true);
    expect(frag.includes('?')).toBe(false);
    const parsed = parseFragmentKey(frag);
    expect(parsed && Array.from(parsed)).toEqual(Array.from(dek));
    expect(parseFragmentKey('')).toBeNull();
    expect(E2E_MODE).toBe('e2e-v1');
  });
});

describe('CSPRNG injection + fingerprints', () => {
  afterEach(() => setRandomSource(null));
  test('uses injected source for keys, nonces and DEKs', () => {
    let calls = 0;
    setRandomSource((n) => { calls++; return new Uint8Array(n).fill(7); });
    expect(secureRandom(12)).toEqual(new Uint8Array(12).fill(7));
    generateIdentityKeypair();
    expect(calls).toBe(2);
  });
  test('rejects broken source output', () => {
    setRandomSource((n) => new Uint8Array(n - 1));
    expect(() => secureRandom(32)).toThrow('CSPRNG_BAD_OUTPUT');
  });
  test('throws without any CSPRNG instead of weak fallback', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { expect(() => secureRandom(8)).toThrow('NO_CSPRNG'); }
    finally { Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true }); }
  });
  test('fingerprint stable and distinct; AAD rejects separator injection', () => {
    const a = generateIdentityKeypair(); const b = generateIdentityKeypair();
    expect(keyFingerprint(a.publicKey)).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
    expect(keyFingerprint(a.publicKey)).not.toBe(keyFingerprint(b.publicKey));
    expect(() => envelopeAadV2({ recordingId: 'a|b', clientUploadId: 'c', ownerId: 'o', recipientId: 'r', recipientKeyId: 'k' })).toThrow('AAD_FIELD');
  });
});
