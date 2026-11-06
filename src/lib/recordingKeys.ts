import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  generateIdentityKeypair, toHex, fromHex, type IdentityKeypair, randomKey32,
} from './recordingCrypto';

const ID_PRIV = 'safewalk.e2e.x25519.sk';
const ID_PUB = 'safewalk.e2e.x25519.pk';
const ID_KEYID = 'safewalk.e2e.x25519.keyId';
const dekKey = (recordingId: string) => `safewalk.e2e.dek.${recordingId}`;

const memory = new Map<string, string>();

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    try { sessionStorage.setItem(key, value); } catch { /* private mode */ }
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (memory.has(key)) return memory.get(key)!;
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function delItem(key: string) {
  if (Platform.OS === 'web') {
    memory.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* */ }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function webKeyStorageWarning(): string | null {
  if (Platform.OS === 'web') {
    return 'Web: sleutels in sessionStorage (niet Secure Enclave). Voor echte device-E2E gebruik iOS/Android.';
  }
  return null;
}

export async function ensureIdentityKeypair(): Promise<IdentityKeypair & { created: boolean }> {
  const sk = await getItem(ID_PRIV);
  const pk = await getItem(ID_PUB);
  const kid = await getItem(ID_KEYID);
  if (sk && pk && kid) {
    return { secretKey: fromHex(sk), publicKey: fromHex(pk), keyId: kid, created: false };
  }
  const kp = generateIdentityKeypair();
  await setItem(ID_PRIV, toHex(kp.secretKey));
  await setItem(ID_PUB, toHex(kp.publicKey));
  await setItem(ID_KEYID, kp.keyId);
  return { ...kp, created: true };
}

export async function rotateIdentityKeypair(): Promise<IdentityKeypair> {
  const kp = generateIdentityKeypair();
  await setItem(ID_PRIV, toHex(kp.secretKey));
  await setItem(ID_PUB, toHex(kp.publicKey));
  await setItem(ID_KEYID, kp.keyId);
  return kp;
}

export async function clearAllLocalRecordingKeys(recordingIds: string[] = []) {
  for (const id of recordingIds) await delItem(dekKey(id));
  await delItem(ID_PRIV);
  await delItem(ID_PUB);
  await delItem(ID_KEYID);
  memory.clear();
}

export async function storeLocalDek(recordingId: string, dek: Uint8Array) {
  await setItem(dekKey(recordingId), toHex(dek));
}

export async function loadLocalDek(recordingId: string): Promise<Uint8Array | null> {
  const h = await getItem(dekKey(recordingId));
  return h ? fromHex(h) : null;
}

export async function deleteLocalDek(recordingId: string) {
  await delItem(dekKey(recordingId));
}

export function newDek(): Uint8Array {
  return randomKey32();
}
