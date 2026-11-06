import { describe, expect, it } from 'vitest';
import {
  sealCombined, openCombined, wrapDekForRecipient, unwrapDek,
  generateIdentityKeypair, encodeFragmentKey, parseFragmentKey,
  aadBytes, randomKey32, E2E_MODE,
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
