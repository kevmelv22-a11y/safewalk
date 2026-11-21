// Toegang tot een publieke link: token → rij, en (optioneel) toegangscode → kortlevende kijkerssleutel.
import type { QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { sha256Hex } from './lib';

export const isHex64 = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

export const linkUsable = (l: Doc<'shareLinks'> | null | undefined, now = Date.now()): l is Doc<'shareLinks'> =>
  !!l && !l.revokedAt && l.expiresAt > now;

/** Geldige, niet-ingetrokken, niet-verlopen link bij dit token; anders null. */
export async function linkByToken(ctx: QueryCtx, token: string, now = Date.now()) {
  if (!isHex64(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
  return linkUsable(row, now) ? row : null;
}

/** Heeft deze kijker de code al ingevuld? Links zonder code: altijd ja. Geblokkeerde link: nooit. */
export async function grantOk(ctx: QueryCtx, link: Doc<'shareLinks'>, grant: string | undefined | null, now = Date.now()) {
  if (!link.codeHash) return true;
  if (link.codeLockedAt !== undefined) return false;
  if (!isHex64(grant)) return false;
  // grantHash = sha256(grant); de ruwe sleutel staat alleen in de browser van de kijker.
  const hashed = await sha256Hex(grant);
  const g = await ctx.db.query('linkGrants').withIndex('by_hash', (q) => q.eq('grantHash', hashed)).first();
  return !!g && g.linkId === link._id && g.expiresAt > now;
}

const PBKDF2_ITERS = 100_000;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function hashAccessCode(code: string, saltHex: string) {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, km, 256);
  return hex(new Uint8Array(bits));
}

export function newSalt() { const b = new Uint8Array(16); crypto.getRandomValues(b); return hex(b); }

/** 6 cijfers met crypto-randomness (geen Math.random); rejection sampling tegen modulo-bias. */
export function newAccessCode() {
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= 4_294_000_000);
  return String(b[0] % 1_000_000).padStart(6, '0');
}

export function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
