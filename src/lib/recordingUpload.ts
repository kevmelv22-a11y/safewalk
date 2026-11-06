import { randomUUID } from 'expo-crypto';
import {
  E2E_MODE, LEGACY_MODE, ENVELOPE_V2, aadBytes, envelopeAadV2, sealCombined, openCombined,
  wrapDekForRecipient, unwrapDek, encodeFragmentKey, fromHex, toHex, b64url, b64urlDecode, keyFingerprint,
  type EncryptionMode,
} from './recordingCrypto';
import {
  getIdentityKeypair, createIdentityKeypair, storeLocalDek, loadLocalDek, deleteLocalDek, newDek,
  webKeyStorageWarning, getPinnedKey, KEY_LOSS_WARNING,
} from './recordingKeys';

export { E2E_MODE, LEGACY_MODE, encodeFragmentKey, webKeyStorageWarning, KEY_LOSS_WARNING, keyFingerprint };
export type { EncryptionMode };

/** Convex HTTP action body limit is 20 MB; keep margin for the 28-byte GCM overhead. */
export const MAX_PLAINTEXT_BYTES = 19 * 1024 * 1024;

export function siteUrl(): string {
  const s = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '');
  if (!s) throw new Error('SITE_URL_MISSING');
  return s;
}

export type ContactKey = { userId: string; keyId: string; publicKeyX25519: string; displayName?: string | null };
export type PutEnvelopes = (a: { recordingId: never; envelopes: {
  recipientId: never; recipientKeyId: string; ephemeralPubX25519: string; wrappedDek: string; version: number;
}[] }) => Promise<unknown>;

/** Pure: encrypt bytes for e2e-v1. Throws on any failure — never returns plaintext. */
export function sealRecording(plaintext: Uint8Array, userId: string) {
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('RECORDING_TOO_LARGE');
  const clientUploadId = randomUUID();
  const dek = newDek();
  const sealed = sealCombined(plaintext, dek, aadBytes(clientUploadId, userId));
  return { dek, sealed, clientUploadId };
}

/**
 * Authenticated upload proxy: ciphertext goes to /recordings/upload with the user's Convex auth token;
 * the server stores it and creates the row in one step (no client-visible unclaimed storageId).
 */
export async function postCiphertext(opts: {
  authToken: string; sealed: Uint8Array; mime: string; clientUploadId: string; plaintextByteSize: number;
  durationMs?: number; incidentId?: string; fetchImpl?: typeof fetch; site?: string;
}): Promise<{ id: string }> {
  const q = new URLSearchParams({
    encryption: E2E_MODE, mime: opts.mime, clientUploadId: opts.clientUploadId,
    plaintextByteSize: String(opts.plaintextByteSize),
  });
  if (opts.durationMs != null) q.set('durationMs', String(Math.round(opts.durationMs)));
  if (opts.incidentId) q.set('incidentId', opts.incidentId);
  const res = await (opts.fetchImpl ?? fetch)(`${opts.site ?? siteUrl()}/recordings/upload?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.authToken}`, 'Content-Type': 'application/octet-stream' },
    body: opts.sealed.slice().buffer as ArrayBuffer,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error(j.error ?? 'UPLOAD_FAILED');
  return { id: j.id as string };
}

/** Wrap DEK (envelope v2) for contacts; refuses contacts whose key differs from a locally pinned key. */
export async function buildEnvelopesForContacts(p: {
  dek: Uint8Array; recordingId: string; clientUploadId: string; ownerId: string; contacts: ContactKey[];
}) {
  const envelopes = []; const skipped: string[] = [];
  for (const c of p.contacts) {
    const pinned = await getPinnedKey(c.userId);
    if (pinned && pinned !== c.publicKeyX25519) { skipped.push(c.displayName ?? c.userId); continue; }
    const aad = envelopeAadV2({ recordingId: p.recordingId, clientUploadId: p.clientUploadId, ownerId: p.ownerId, recipientId: c.userId, recipientKeyId: c.keyId });
    const { ephemeralPublicKey, wrapped } = wrapDekForRecipient(p.dek, fromHex(c.publicKeyX25519), aad);
    envelopes.push({
      recipientId: c.userId as never, recipientKeyId: c.keyId,
      ephemeralPubX25519: toHex(ephemeralPublicKey), wrappedDek: b64url(wrapped), version: ENVELOPE_V2,
    });
  }
  return { envelopes, skipped };
}

/** Full owner pipeline: seal → authenticated upload → store DEK locally → envelopes. */
export async function uploadEncryptedRecording(opts: {
  blob: Blob; mime: string; userId: string; authToken: string | null | undefined;
  contacts: ContactKey[]; putEnvelopes: PutEnvelopes; durationMs?: number; incidentId?: string;
}) {
  if (!opts.authToken) throw new Error('NOT_AUTHENTICATED');
  if (opts.blob.size > MAX_PLAINTEXT_BYTES) throw new Error('RECORDING_TOO_LARGE');
  const plaintext = new Uint8Array(await opts.blob.arrayBuffer());
  const { dek, sealed, clientUploadId } = sealRecording(plaintext, opts.userId);
  plaintext.fill(0);
  try {
    const { id } = await postCiphertext({
      authToken: opts.authToken, sealed, mime: (opts.mime.split(';')[0] || 'audio/m4a').trim(), clientUploadId,
      plaintextByteSize: opts.blob.size, durationMs: opts.durationMs, incidentId: opts.incidentId,
    });
    await storeLocalDek(id, dek);
    const { envelopes, skipped } = await buildEnvelopesForContacts({ dek, recordingId: id, clientUploadId, ownerId: opts.userId, contacts: opts.contacts });
    if (envelopes.length) await opts.putEnvelopes({ recordingId: id as never, envelopes });
    return {
      id, byteSize: sealed.byteLength, shared: envelopes.length, skipped,
      note: 'Versleuteld (e2e-v1) opgeslagen; de sleutel ging niet naar de server.'
        + (skipped.length ? ` Niet gedeeld met ${skipped.join(', ')}: hun sleutel is gewijzigd t.o.v. jouw verificatie.` : ''),
    };
  } finally { dek.fill(0); }
}

/** Authenticated ciphertext fetch through the ACL-rechecking proxy (no long-lived storage URL). */
export async function fetchCiphertext(recordingId: string, authToken: string, fetchImpl: typeof fetch = fetch, site?: string) {
  const res = await fetchImpl(`${site ?? siteUrl()}/recordings/blob?id=${encodeURIComponent(recordingId)}`, {
    headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'DOWNLOAD_FAILED');
  return new Uint8Array(await res.arrayBuffer());
}

export type AccessMeta = {
  encryption: EncryptionMode; clientUploadId: string | null; ownerId: string; isOwner: boolean;
  envelope: null | { ephemeralPubX25519: string; wrappedDek: string; recipientKeyId: string; version: number | null };
};

/** Decrypt for owner (local DEK) or recipient (envelope). Legacy plaintext only when server says 'none'. */
export async function decryptDownload(opts: AccessMeta & { ciphertext: Uint8Array; recordingId: string; myUserId: string }): Promise<Uint8Array> {
  if (opts.encryption === LEGACY_MODE) return opts.ciphertext;
  if (opts.encryption !== E2E_MODE) throw new Error('UNKNOWN_ENCRYPTION');
  if (!opts.clientUploadId) throw new Error('AAD_MISSING');
  let dek: Uint8Array | null = null;
  if (opts.isOwner) {
    dek = await loadLocalDek(opts.recordingId);
  } else if (opts.envelope) {
    const id = await getIdentityKeypair();
    if (!id) throw new Error('E2E_NO_LOCAL_KEY');
    if (id.keyId !== opts.envelope.recipientKeyId) throw new Error('E2E_KEY_MISMATCH');
    const aad = opts.envelope.version === ENVELOPE_V2
      ? envelopeAadV2({ recordingId: opts.recordingId, clientUploadId: opts.clientUploadId, ownerId: opts.ownerId, recipientId: opts.myUserId, recipientKeyId: id.keyId })
      : undefined; // v1 legacy envelopes (unbound) still readable
    dek = unwrapDek(b64urlDecode(opts.envelope.wrappedDek), fromHex(opts.envelope.ephemeralPubX25519), id.secretKey, aad);
  }
  if (!dek) throw new Error('DEK_MISSING');
  try { return openCombined(opts.ciphertext, dek, aadBytes(opts.clientUploadId, opts.ownerId)); } finally { dek.fill(0); }
}

/** Explicit key registration. Never rotates silently: rotate=true required to replace an existing key. */
export async function registerMyPublicKey(register: (args: {
  keyId: string; publicKeyX25519: string; revokePrevious?: boolean;
}) => Promise<unknown>, opts: { rotate?: boolean } = {}) {
  let kp = await getIdentityKeypair();
  const create = !kp || !!opts.rotate;
  if (create) kp = await createIdentityKeypair();
  await register({ keyId: kp!.keyId, publicKeyX25519: toHex(kp!.publicKey), revokePrevious: create });
  return { ...kp!, created: create, fingerprint: keyFingerprint(kp!.publicKey) };
}

export { deleteLocalDek, getIdentityKeypair };
