import { randomUUID } from 'expo-crypto';
import {
  E2E_MODE, LEGACY_MODE, aadBytes, sealCombined, openCombined,
  wrapDekForRecipient, unwrapDek, encodeFragmentKey, fromHex, toHex, b64url, b64urlDecode,
  type EncryptionMode,
} from './recordingCrypto';
import {
  ensureIdentityKeypair, storeLocalDek, loadLocalDek, deleteLocalDek, newDek, webKeyStorageWarning,
} from './recordingKeys';
import { uploadBlob } from './recording';

export { E2E_MODE, LEGACY_MODE, encodeFragmentKey, webKeyStorageWarning };
export type { EncryptionMode };

export const MAX_PLAINTEXT_BYTES = 24 * 1024 * 1024; // server cap 25 MB incl. 28 B overhead

/** Encrypt (e2e-v1) then upload ciphertext. Never falls back to plaintext: encrypt errors throw. Plaintext only when preferE2e === false (explicit). */
export async function encryptAndUpload(opts: {
  blob: Blob;
  mime: string;
  userId: string;
  uploadUrl: string;
  preferE2e?: boolean;
}): Promise<{
  storageId: string;
  encryption: EncryptionMode;
  clientUploadId: string;
  byteSize: number;
  plaintextByteSize: number;
  dek: Uint8Array | null;
  mimeStored: string;
  note: string;
}> {
  const prefer = opts.preferE2e !== false;
  if (opts.blob.size > MAX_PLAINTEXT_BYTES) throw new Error('RECORDING_TOO_LARGE');
  const plaintext = new Uint8Array(await opts.blob.arrayBuffer());
  const plaintextByteSize = plaintext.byteLength;
  if (plaintextByteSize > MAX_PLAINTEXT_BYTES) throw new Error('RECORDING_TOO_LARGE');
  const clientUploadId = randomUUID();

  if (!prefer) {
    const storageId = await uploadBlob(opts.uploadUrl, opts.blob, opts.mime);
    return {
      storageId, encryption: LEGACY_MODE, clientUploadId, byteSize: plaintextByteSize,
      plaintextByteSize, dek: null, mimeStored: opts.mime,
      note: 'LEGACY_PLAINTEXT: bewust onversleuteld geüpload.',
    };
  }

  const dek = newDek();
  const aad = aadBytes(clientUploadId, opts.userId);
  const sealed = sealCombined(plaintext, dek, aad);
  const sealedBlob = new Blob([sealed.slice()], { type: 'application/octet-stream' });
  const storageId = await uploadBlob(opts.uploadUrl, sealedBlob, 'application/octet-stream');
  return {
    storageId,
    encryption: E2E_MODE,
    clientUploadId,
    byteSize: sealed.byteLength,
    plaintextByteSize,
    dek,
    mimeStored: opts.mime, // original audio mime for player
    note: 'E2E_V1: AES-256-GCM vóór upload; DEK niet naar server.' + (webKeyStorageWarning() ? ' ' + webKeyStorageWarning() : ''),
  };
}

export async function persistDekAfterFinalize(recordingId: string, dek: Uint8Array) {
  await storeLocalDek(recordingId, dek);
}

export async function buildEnvelopesForContacts(
  dek: Uint8Array,
  contacts: { userId: string; keyId: string; publicKeyX25519: string }[],
) {
  return contacts.map((c) => {
    const { ephemeralPublicKey, wrapped } = wrapDekForRecipient(dek, fromHex(c.publicKeyX25519));
    return {
      recipientId: c.userId as never,
      recipientKeyId: c.keyId,
      ephemeralPubX25519: toHex(ephemeralPublicKey),
      wrappedDek: b64url(wrapped),
    };
  });
}

export async function decryptDownload(opts: {
  ciphertext: Uint8Array;
  encryption: EncryptionMode;
  userIdOwner: string;
  clientUploadId: string | null;
  isOwner: boolean;
  recordingId: string;
  envelope: null | { ephemeralPubX25519: string; wrappedDek: string; recipientKeyId: string };
}): Promise<Uint8Array> {
  if (opts.encryption === LEGACY_MODE) {
    return opts.ciphertext;
  }
  let dek: Uint8Array | null = null;
  if (opts.isOwner) {
    dek = await loadLocalDek(opts.recordingId);
  } else if (opts.envelope) {
    const id = await ensureIdentityKeypair();
    if (id.keyId !== opts.envelope.recipientKeyId) throw new Error('E2E_KEY_MISMATCH');
    dek = unwrapDek(
      b64urlDecode(opts.envelope.wrappedDek),
      fromHex(opts.envelope.ephemeralPubX25519),
      id.secretKey,
    );
  }
  if (!dek) throw new Error('DEK_MISSING');
  if (!opts.clientUploadId) throw new Error('AAD_MISSING');
  const aad = aadBytes(opts.clientUploadId, opts.userIdOwner);
  return openCombined(opts.ciphertext, dek, aad);
}

export async function registerMyPublicKey(register: (args: {
  keyId: string; publicKeyX25519: string; revokePrevious?: boolean;
}) => Promise<unknown>) {
  const kp = await ensureIdentityKeypair();
  await register({ keyId: kp.keyId, publicKeyX25519: toHex(kp.publicKey), revokePrevious: kp.created });
  return kp;
}

export { deleteLocalDek };
