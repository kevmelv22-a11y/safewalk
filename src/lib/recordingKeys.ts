import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import {
  generateIdentityKeypair, toHex, fromHex, type IdentityKeypair, randomKey32, setRandomSource,
} from './recordingCrypto';

// Explicit CSPRNG wiring (no global polyfill): native uses expo-crypto (SecRandomCopyBytes / SecureRandom).
// Web keeps WebCrypto getRandomValues via the default path in recordingCrypto.
if (Platform.OS !== 'web') setRandomSource((n) => ExpoCrypto.getRandomBytes(n));

const ID_PRIV = 'safewalk.e2e.x25519.sk';
const ID_PUB = 'safewalk.e2e.x25519.pk';
const ID_KEYID = 'safewalk.e2e.x25519.keyId';
const dekKey = (recordingId: string) => `safewalk.e2e.dek.${recordingId}`;
const pinKey = (userId: string) => `safewalk.e2e.pin.${userId}`;

/**
 * Web: localStorage (persists across tabs so a new tab does NOT silently create + revoke keys).
 * Trade-off: readable by any script on the origin (XSS) — not hardware-backed. Native: SecureStore, this device only.
 */
function webStore(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') { const s = webStore(); if (!s) throw new Error('KEYSTORE_UNAVAILABLE'); s.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const s = webStore();
    const v = s?.getItem(key) ?? null;
    if (v !== null || !s) return v;
    // one-time migration from the old per-tab sessionStorage location
    try { const old = sessionStorage.getItem(key); if (old !== null) { s.setItem(key, old); sessionStorage.removeItem(key); } return old; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}
async function delItem(key: string) {
  if (Platform.OS === 'web') { webStore()?.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

export const KEY_LOSS_WARNING =
  'Let op: de sleutels van versleutelde opnames staan alleen op dit apparaat. Verwijder je de app, wis je browsergegevens of wissel je van telefoon, dan kun jij én je contacten deze opnames niet meer openen. Er is (nog) geen herstel.';

export function webKeyStorageWarning(): string | null {
  return Platform.OS === 'web'
    ? 'Web: sleutels staan in localStorage van deze browser (niet hardware-beveiligd). Gebruik voor echte bescherming de iOS/Android-app.'
    : null;
}

/** Read the identity key; never creates one implicitly. */
export async function getIdentityKeypair(): Promise<IdentityKeypair | null> {
  const [sk, pk, kid] = await Promise.all([getItem(ID_PRIV), getItem(ID_PUB), getItem(ID_KEYID)]);
  if (sk && pk && kid) return { secretKey: fromHex(sk), publicKey: fromHex(pk), keyId: kid };
  return null;
}

/** Explicit: create (or replace) this device's identity key. Old envelopes for the old key become unreadable here. */
export async function createIdentityKeypair(): Promise<IdentityKeypair> {
  const kp = generateIdentityKeypair();
  await setItem(ID_PRIV, toHex(kp.secretKey));
  await setItem(ID_PUB, toHex(kp.publicKey));
  await setItem(ID_KEYID, kp.keyId);
  return kp;
}

export async function clearAllLocalRecordingKeys(recordingIds: string[] = []) {
  for (const id of recordingIds) await delItem(dekKey(id));
  await delItem(ID_PRIV); await delItem(ID_PUB); await delItem(ID_KEYID);
}

export async function storeLocalDek(recordingId: string, dek: Uint8Array) { await setItem(dekKey(recordingId), toHex(dek)); }
export async function loadLocalDek(recordingId: string): Promise<Uint8Array | null> {
  const h = await getItem(dekKey(recordingId));
  return h ? fromHex(h) : null;
}
export async function deleteLocalDek(recordingId: string) { await delItem(dekKey(recordingId)); }

/** Pinned (user-verified) contact public keys, stored locally — server cannot change them silently. */
export async function getPinnedKey(contactUserId: string): Promise<string | null> { return getItem(pinKey(contactUserId)); }
export async function pinContactKey(contactUserId: string, publicKeyHex: string) { await setItem(pinKey(contactUserId), publicKeyHex); }
export async function unpinContactKey(contactUserId: string) { await delItem(pinKey(contactUserId)); }

export function newDek(): Uint8Array { return randomKey32(); }
