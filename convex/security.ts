import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, displayName, fail, rateLimit, requireUser, sha256Hex } from './lib';
import { queuePush, mapsLink } from './notify';

const PIN_MIN = 4;
const PIN_MAX = 8;
const PBKDF2_ITERS = 210_000;

function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function derivePinHash(pin: string, saltHex: string) {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, keyMaterial, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newSaltHex() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Publiek statusveld: of er een PIN is, nooit de hash. */
export const pinStatus = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p) return null;
    return {
      pinSet: Boolean(p.pinHash && p.pinSalt),
      torchStrobeOptIn: !!p.torchStrobeOptIn,
      pinSetAt: p.pinSetAt ?? null,
    };
  },
});

/**
 * Stelt of wijzigt de veiligheids-PIN. Alleen server-side hashing (PBKDF2-SHA256 + random salt).
 * De client stuurt de PIN één keer mee; die wordt niet gelogd en niet opgeslagen.
 */
export const setPin = mutation({
  args: { pin: v.string(), confirmPin: v.string(), currentPin: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `pin-set:${uid}`, 5, 60 * 60_000);
    if (!isValidPin(a.pin) || a.pin !== a.confirmPin) fail('PIN_INVALID');
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p || p.restricted) fail('FORBIDDEN');
    const profile = p!;
    if (profile.pinHash && profile.pinSalt) {
      if (!a.currentPin || !isValidPin(a.currentPin)) fail('PIN_REQUIRED');
      const cur = await derivePinHash(a.currentPin!, profile.pinSalt);
      if (!timingSafeEqualHex(cur, profile.pinHash)) fail('PIN_WRONG');
    }
    const salt = newSaltHex();
    const hash = await derivePinHash(a.pin, salt);
    await ctx.db.patch(profile._id, { pinHash: hash, pinSalt: salt, pinSetAt: Date.now() });
    await audit(ctx, uid, 'security.pin_set');
    return { ok: true as const };
  },
});

export const setTorchOptIn = mutation({
  args: { optIn: v.boolean() },
  handler: async (ctx, { optIn }) => {
    const uid = await requireUser(ctx);
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p) fail('NOT_FOUND');
    await ctx.db.patch(p!._id, { torchStrobeOptIn: optIn });
    return { ok: true as const };
  },
});

/**
 * Verifieert de PIN server-side. Bij fout: generieke clientfout + stil alarm naar contacten
 * (alleen als verse, toestemming-gedekte locatie is meegestuurd).
 * Succes wordt NOOIT client-autoritatief bepaald.
 */
export const verifyPin = mutation({
  args: {
    pin: v.string(),
    purpose: v.union(v.literal('unlock_danger'), v.literal('arrived_safe'), v.literal('change_pin')),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracyM: v.optional(v.number()),
    locationAt: v.optional(v.number()),
    locationConsent: v.optional(v.boolean()),
    incidentId: v.optional(v.id('incidents')),
    sessionId: v.optional(v.id('sessions')),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `pin-verify:${uid}`, 12, 15 * 60_000);
    if (!isValidPin(a.pin)) return { ok: false as const, reason: 'invalid' as const };
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p?.pinHash || !p.pinSalt) fail('PIN_NOT_SET');
    const salt = p!.pinSalt!;
    const expected = p!.pinHash!;
    const hash = await derivePinHash(a.pin, salt);
    const match = timingSafeEqualHex(hash, expected);
    if (!match) {
      // Stil alarm: push naar contacten, generieke fout voor de gebruiker
      const fresh = a.locationConsent === true
        && a.lat !== undefined && a.lng !== undefined
        && a.locationAt !== undefined
        && Date.now() - a.locationAt < 5 * 60_000;
      const alertId = await ctx.db.insert('alerts', {
        userId: uid, kind: 'wrong_pin', sessionId: a.sessionId,
        lat: fresh ? a.lat : undefined, lng: fresh ? a.lng : undefined,
        accuracyM: fresh ? a.accuracyM : undefined, locationAt: fresh ? a.locationAt : undefined,
        status: 'open',
      });
      const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
      const name = await displayName(ctx, uid);
      const link = fresh ? mapsLink(a.lat, a.lng) : null;
      if (contacts.length) {
        await queuePush(ctx, {
          kind: 'wrong_pin', alertId, sessionId: a.sessionId, recipients: contacts.map((c) => c.contactId),
          title: `⚠️ Melding van ${name}`,
          // Exacte gevraagde tekst; locatie apart erachter (geen secrets/PIN in push)
          body: link
            ? `Er is een melding verstuurd met een fout wachtwoord. Locatie: ${link}`
            : `Er is een melding verstuurd met een fout wachtwoord.`,
        });
      }
      await audit(ctx, uid, 'security.pin_wrong', alertId, { purpose: a.purpose, hadLocation: !!fresh, recipients: contacts.length });
      return { ok: false as const, reason: 'wrong' as const };
    }
    // Juiste PIN: doel-specifieke acties
    if (a.purpose === 'unlock_danger') {
      // Server-autoriteit: juiste PIN lost ALLE actieve incidenten van deze user op
      // (niet alleen het meegestuurde id — voorkomt bypass door id weg te laten)
      if (a.incidentId) {
        const raw = await ctx.db.get(a.incidentId);
        if (raw && raw.userId !== uid) fail('FORBIDDEN');
      }
      const open = await ctx.db.query('incidents').withIndex('by_user_status', (q) => q.eq('userId', uid).eq('status', 'active')).collect();
      let lastAlert: typeof open[0]['alertId'] | undefined;
      let lastSession: typeof open[0]['sessionId'] | undefined;
      const clearedIds = open.map((i) => i._id);
      for (const inc of open) {
        await ctx.db.patch(inc._id, { status: 'resolved', resolvedAt: Date.now() });
        if (inc.alertId) {
          const al = await ctx.db.get(inc.alertId);
          if (al && al.status === 'open') await ctx.db.patch(inc.alertId, { status: 'resolved' });
        }
        lastAlert = inc.alertId; lastSession = inc.sessionId;
      }
      if (clearedIds.length) {
        await ctx.scheduler.runAfter(0, internal.tracking.revokeForIncidents, { userId: uid, incidentIds: clearedIds });
      }
      if (open.length) {
        const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
        const name = await displayName(ctx, uid);
        if (contacts.length) {
          await queuePush(ctx, {
            kind: 'arrived_safe', recipients: contacts.map((c) => c.contactId),
            title: `✅ ${name}: alarm gestopt`,
            body: `${name} heeft het alarm met de veiligheids-PIN gestopt.`,
            alertId: lastAlert, sessionId: a.sessionId ?? lastSession,
          });
        }
        await audit(ctx, uid, 'incident.unlocked', a.incidentId, { cleared: open.length });
      }
    }
    if (a.purpose === 'arrived_safe') {
      const alertId = await ctx.db.insert('alerts', {
        userId: uid, kind: 'arrived_safe', sessionId: a.sessionId, status: 'resolved',
        lat: a.locationConsent && a.lat !== undefined ? a.lat : undefined,
        lng: a.locationConsent && a.lng !== undefined ? a.lng : undefined,
        accuracyM: a.locationConsent ? a.accuracyM : undefined,
        locationAt: a.locationConsent ? a.locationAt : undefined,
      });
      // Beëindig open incidenten
      const open = await ctx.db.query('incidents').withIndex('by_user_status', (q) => q.eq('userId', uid).eq('status', 'active')).collect();
      const clearedIds = open.map((i) => i._id);
      for (const inc of open) await ctx.db.patch(inc._id, { status: 'resolved', resolvedAt: Date.now() });
      if (clearedIds.length) {
        await ctx.scheduler.runAfter(0, internal.tracking.revokeForIncidents, { userId: uid, incidentIds: clearedIds });
      }
      if (a.sessionId) {
        const s = await ctx.db.get(a.sessionId);
        if (s && s.userId === uid && s.endedAt === undefined) {
          await ctx.db.patch(a.sessionId, { status: 'ended', endedAt: Date.now() });
        }
      }
      const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
      const name = await displayName(ctx, uid);
      if (contacts.length) {
        await queuePush(ctx, {
          kind: 'arrived_safe', alertId, sessionId: a.sessionId, recipients: contacts.map((c) => c.contactId),
          title: `✅ ${name} is veilig aangekomen`,
          body: `${name} heeft bevestigd veilig te zijn aangekomen (PIN geverifieerd).`,
        });
      }
      await audit(ctx, uid, 'incident.arrived_safe', alertId);
    }
    await audit(ctx, uid, 'security.pin_ok', undefined, { purpose: a.purpose });
    return { ok: true as const };
  },
});

// Exporteer helpers voor tests (niet via API)
export const _test = { derivePinHash, timingSafeEqualHex, isValidPin, PBKDF2_ITERS, sha256Hex };
