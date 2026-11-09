import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, displayName, fail, randomToken, rateLimit, requireAdult, requireUser, sha256Hex } from './lib';
import { queuePush, mapsLink } from './notify';

const DEFAULT_SHARE_TTL = 2 * 60 * 60_000;

/** Actief incident van de gebruiker (gevaarmodus). */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    return await ctx.db.query('incidents').withIndex('by_user_status', (q) => q.eq('userId', uid).eq('status', 'active')).first() ?? null;
  },
});

/**
 * Rood: "Ik voel me niet veilig" — start incident + push + optionele tracking-link.
 * Alarm/zaklamp starten client-side na server-bevestiging; PIN vereist om te stoppen.
 * Geen automatische 112. Opname start client-side na mic-consent.
 */
export const startUnsafe = mutation({
  args: {
    clientRef: v.string(),
    sessionId: v.optional(v.id('sessions')),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracyM: v.optional(v.number()),
    locationAt: v.optional(v.number()),
    locationConsent: v.boolean(),
    torchRequested: v.boolean(),
    /** Expliciet: maak intrekbaar tracking-link (location scope). Vereist locationConsent. */
    createTrackingLink: v.optional(v.boolean()),
    /** Expliciet: recording-scope op dezelfde link (download alleen met geldige token). */
    shareRecordingScope: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    await rateLimit(ctx, `incident:${uid}`, 10, 10 * 60_000);
    const existing = await ctx.db.query('alerts').withIndex('by_client_ref', (q) => q.eq('clientRef', a.clientRef)).first();
    if (existing) {
      if (existing.userId !== uid) fail('FORBIDDEN');
      const inc = await ctx.db.query('incidents').withIndex('by_user_status', (q) => q.eq('userId', uid).eq('status', 'active')).first();
      return { incidentId: inc?._id ?? null, alertId: existing._id, shareToken: null as string | null, sharePath: null as string | null, shareExpiresAt: null as number | null };
    }
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (!p?.pinHash) fail('PIN_NOT_SET');
    const torchOk = a.torchRequested && !!p!.torchStrobeOptIn;
    const fresh = a.locationConsent && a.lat !== undefined && a.lng !== undefined && a.locationAt !== undefined && Date.now() - a.locationAt < 5 * 60_000;
    let sessionId = a.sessionId;
    if (sessionId) {
      const s = await ctx.db.get(sessionId);
      if (!s || s.userId !== uid) sessionId = undefined;
    }
    const alertId = await ctx.db.insert('alerts', {
      userId: uid, kind: 'unsafe', clientRef: a.clientRef, sessionId,
      lat: fresh ? a.lat : undefined, lng: fresh ? a.lng : undefined,
      accuracyM: fresh ? a.accuracyM : undefined, locationAt: fresh ? a.locationAt : undefined,
      status: 'open',
    });
    const incidentId = await ctx.db.insert('incidents', {
      userId: uid, kind: 'unsafe', status: 'active', alertId, sessionId,
      startedAt: Date.now(), torchRequested: torchOk,
    });
    if (fresh && a.lat !== undefined && a.lng !== undefined) {
      await ctx.db.insert('incidentLocations', {
        incidentId, userId: uid, lat: a.lat, lng: a.lng,
        accuracyM: a.accuracyM, recordedAt: a.locationAt ?? Date.now(),
      });
    }

    let shareToken: string | null = null;
    let sharePath: string | null = null;
    let shareExpiresAt: number | null = null;
    const wantLink = a.createTrackingLink !== false && a.locationConsent;
    if (wantLink) {
      const scopes: ('location' | 'recording')[] = ['location'];
      if (a.shareRecordingScope) scopes.push('recording');
      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = Date.now() + DEFAULT_SHARE_TTL;
      await ctx.db.insert('shareLinks', {
        userId: uid, tokenHash, incidentId, sessionId, label: 'Gevaarmodus',
        scopes, locationConsent: true, expiresAt, createdAt: Date.now(),
      });
      shareToken = token;
      sharePath = `/track/live?token=${token}`;
      shareExpiresAt = expiresAt;
      await audit(ctx, uid, 'share.create', incidentId, { scopes, via: 'startUnsafe' });
    }

    const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    const name = await displayName(ctx, uid);
    const maps = mapsLink(fresh ? a.lat : undefined, fresh ? a.lng : undefined);
    const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
    const trackHint = sharePath && site ? ` Tracking: ${site}${sharePath}` : '';
    if (contacts.length) {
      await queuePush(ctx, {
        kind: 'unsafe', alertId, sessionId, recipients: contacts.map((c) => c.contactId),
        title: `🆘 ${name} voelt zich niet veilig`,
        body: maps
          ? `${name} heeft "Ik voel me niet veilig" geactiveerd. Locatie: ${maps}.${trackHint} SafeWalk belt niet 112.`
          : `${name} heeft "Ik voel me niet veilig" geactiveerd. Geen recente locatie.${trackHint} SafeWalk belt niet 112.`,
      });
    }
    await audit(ctx, uid, 'incident.unsafe', incidentId, { recipients: contacts.length, torch: torchOk, share: !!shareToken });
    return { incidentId, alertId, shareToken, sharePath, shareExpiresAt };
  },
});

/** Oranje: "Kom snel" — push naar contacten, geen alarm/PIN. */
export const comeQuick = mutation({
  args: {
    clientRef: v.string(),
    sessionId: v.optional(v.id('sessions')),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracyM: v.optional(v.number()),
    locationAt: v.optional(v.number()),
    locationConsent: v.boolean(),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    await rateLimit(ctx, `incident:${uid}`, 10, 10 * 60_000);
    const existing = await ctx.db.query('alerts').withIndex('by_client_ref', (q) => q.eq('clientRef', a.clientRef)).first();
    if (existing) { if (existing.userId !== uid) fail('FORBIDDEN'); return { alertId: existing._id }; }
    const fresh = a.locationConsent && a.lat !== undefined && a.lng !== undefined && a.locationAt !== undefined && Date.now() - a.locationAt < 5 * 60_000;
    let sessionId = a.sessionId;
    if (sessionId) { const s = await ctx.db.get(sessionId); if (!s || s.userId !== uid) sessionId = undefined; }
    const alertId = await ctx.db.insert('alerts', {
      userId: uid, kind: 'come_quick', clientRef: a.clientRef, sessionId,
      lat: fresh ? a.lat : undefined, lng: fresh ? a.lng : undefined,
      accuracyM: fresh ? a.accuracyM : undefined, locationAt: fresh ? a.locationAt : undefined,
      status: 'open',
    });
    const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    const name = await displayName(ctx, uid);
    const link = mapsLink(fresh ? a.lat : undefined, fresh ? a.lng : undefined);
    if (contacts.length) {
      await queuePush(ctx, {
        kind: 'come_quick', alertId, sessionId, recipients: contacts.map((c) => c.contactId),
        title: `🟠 ${name}: kom snel`,
        body: link
          ? `${name} vraagt je snel te komen. Locatie: ${link}. SafeWalk belt niet 112.`
          : `${name} vraagt je snel te komen. Geen recente locatie. SafeWalk belt niet 112.`,
      });
    }
    await audit(ctx, uid, 'incident.come_quick', alertId, { recipients: contacts.length });
    return { alertId };
  },
});

/**
 * Consented locatie-update tijdens actief incident (bron voor publieke tracking-link).
 * Zonder consent of zonder actief incident: geweigerd.
 */
export const pingLocation = mutation({
  args: {
    incidentId: v.id('incidents'),
    lat: v.number(),
    lng: v.number(),
    accuracyM: v.optional(v.number()),
    recordedAt: v.number(),
    locationConsent: v.boolean(),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    if (!a.locationConsent) fail('LOCATION_CONSENT_REQUIRED');
    if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) fail('BAD_REQUEST');
    await rateLimit(ctx, `inc-loc:${uid}`, 240, 60 * 60_000);
    const inc = await ctx.db.get(a.incidentId);
    if (!inc || inc.userId !== uid || inc.status !== 'active') fail('NOT_FOUND');
    const incident = inc!;
    await ctx.db.insert('incidentLocations', {
      incidentId: a.incidentId, userId: uid, lat: a.lat, lng: a.lng,
      accuracyM: a.accuracyM, recordedAt: Math.min(a.recordedAt, Date.now()),
    });
    // Optioneel: ook trip-sessie voeden als gekoppeld
    if (incident.sessionId) {
      const s = await ctx.db.get(incident.sessionId);
      if (s && s.userId === uid && s.endedAt === undefined) {
        await ctx.db.insert('locations', {
          sessionId: incident.sessionId, userId: uid, lat: a.lat, lng: a.lng,
          accuracyM: a.accuracyM, recordedAt: Math.min(a.recordedAt, Date.now()),
        });
      }
    }
    return { ok: true as const };
  },
});

/** Stuur éénmalig live-locatie ping naar trusted contacts (foreground-alternatief volume×2). */
export const sendLiveLocationNow = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    accuracyM: v.optional(v.number()),
    locationAt: v.number(),
    locationConsent: v.boolean(),
    sessionId: v.optional(v.id('sessions')),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    if (!a.locationConsent) fail('LOCATION_CONSENT_REQUIRED');
    await rateLimit(ctx, `live-now:${uid}`, 20, 60 * 60_000);
    const fresh = Date.now() - a.locationAt < 5 * 60_000;
    if (!fresh) fail('LOCATION_STALE');
    const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    const name = await displayName(ctx, uid);
    const link = mapsLink(a.lat, a.lng);
    const alertId = await ctx.db.insert('alerts', {
      userId: uid, kind: 'come_quick', sessionId: a.sessionId, status: 'open',
      lat: a.lat, lng: a.lng, accuracyM: a.accuracyM, locationAt: a.locationAt,
      clientRef: `live-${Date.now()}`,
    });
    if (contacts.length) {
      await queuePush(ctx, {
        kind: 'come_quick', alertId, sessionId: a.sessionId, recipients: contacts.map((c) => c.contactId),
        title: `📍 ${name}: live locatie`,
        body: `${name} stuurde zojuist een locatie (in-app). ${link ?? ''} SafeWalk belt niet 112.`,
      });
    }
    await audit(ctx, uid, 'incident.live_location_now', alertId, { recipients: contacts.length });
    return { alertId, recipients: contacts.length };
  },
});
