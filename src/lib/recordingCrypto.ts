/**
 * Bounded recording E2E helpers — @noble (audited) AES-256-GCM + X25519 + HKDF.
 * Server never receives content DEKs. External keys only in URL fragment (#), never query.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes, bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const E2E_MODE = 'e2e-v1' as const;
export const LEGACY_MODE = 'none' as const;
export type EncryptionMode = typeof E2E_MODE | typeof LEGACY_MODE;

const INFO_WRAP = new TextEncoder().encode('safewalk-rec-wrap-v1');
const INFO_AAD_PREFIX = 'safewalk-rec-aad-v1|';

export function aadBytes(clientUploadId: string, userId: string): Uint8Array {
  return new TextEncoder().encode(`${INFO_AAD_PREFIX}${userId}|${clientUploadId}`);
}

/** CSPRNG via noble (uses WebCrypto getRandomValues / node crypto). */
export function randomKey32(): Uint8Array {
  return randomBytes(32);
}

export function randomNonce12(): Uint8Array {
  return randomBytes(12);
}

export function encryptAesGcm(
  plaintext: Uint8Array,
  key: Uint8Array,
  aad?: Uint8Array,
): { nonce: Uint8Array; ciphertextWithTag: Uint8Array } {
  if (key.length !== 32) throw new Error('KEY_SIZE');
  const nonce = randomNonce12();
  const ciphertextWithTag = gcm(key, nonce, aad).encrypt(plaintext);
  return { nonce, ciphertextWithTag };
}

export function decryptAesGcm(
  ciphertextWithTag: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  if (key.length !== 32) throw new Error('KEY_SIZE');
  try {
    return gcm(key, nonce, aad).decrypt(ciphertextWithTag);
  } catch {
    throw new Error('DECRYPT_FAILED');
  }
}

/** Combined wire format: 12-byte nonce || ciphertext||tag */
export function sealCombined(plaintext: Uint8Array, key: Uint8Array, aad?: Uint8Array): Uint8Array {
  const { nonce, ciphertextWithTag } = encryptAesGcm(plaintext, key, aad);
  const out = new Uint8Array(nonce.length + ciphertextWithTag.length);
  out.set(nonce, 0);
  out.set(ciphertextWithTag, nonce.length);
  return out;
}

export function openCombined(combined: Uint8Array, key: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (combined.length < 12 + 16) throw new Error('CIPHERTEXT_SHORT');
  const nonce = combined.slice(0, 12);
  const ct = combined.slice(12);
  return decryptAesGcm(ct, key, nonce, aad);
}

export type IdentityKeypair = { secretKey: Uint8Array; publicKey: Uint8Array; keyId: string };

export function generateIdentityKeypair(): IdentityKeypair {
  const kp = x25519.keygen();
  const keyId = bytesToHex(sha256(kp.publicKey)).slice(0, 16);
  return { secretKey: kp.secretKey, publicKey: kp.publicKey, keyId };
}

export function wrapDekForRecipient(
  dek: Uint8Array,
  recipientPublicKey: Uint8Array,
): { ephemeralPublicKey: Uint8Array; wrapped: Uint8Array } {
  const eph = x25519.keygen();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientPublicKey);
  const wrapKey = hkdf(sha256, shared, undefined, INFO_WRAP, 32);
  const { nonce, ciphertextWithTag } = encryptAesGcm(dek, wrapKey);
  const wrapped = new Uint8Array(nonce.length + ciphertextWithTag.length);
  wrapped.set(nonce, 0);
  wrapped.set(ciphertextWithTag, nonce.length);
  // Zeroize shared material where possible
  shared.fill(0);
  wrapKey.fill(0);
  return { ephemeralPublicKey: eph.publicKey, wrapped };
}

export function unwrapDek(
  wrapped: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array {
  if (wrapped.length < 12 + 16) throw new Error('WRAP_SHORT');
  const shared = x25519.getSharedSecret(recipientSecretKey, ephemeralPublicKey);
  const wrapKey = hkdf(sha256, shared, undefined, INFO_WRAP, 32);
  const nonce = wrapped.slice(0, 12);
  const ct = wrapped.slice(12);
  try {
    return decryptAesGcm(ct, wrapKey, nonce);
  } finally {
    shared.fill(0);
    wrapKey.fill(0);
  }
}

/** Fragment-only external key: `#k=v1.<base64url(dek)>` — never put in query/path. */
export function encodeFragmentKey(dek: Uint8Array): string {
  return `#k=v1.${b64url(dek)}`;
}

export function parseFragmentKey(hash: string): Uint8Array | null {
  const m = /^#?k=v1\.([A-Za-z0-9_-]+)$/.exec(hash.trim());
  if (!m) return null;
  try {
    return b64urlDecode(m[1]);
  } catch {
    return null;
  }
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof atob !== 'undefined') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}
export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex);
}

export { bytesToHex, hexToBytes };
