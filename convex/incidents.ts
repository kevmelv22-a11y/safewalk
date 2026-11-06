import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, displayName, fail, rateLimit, requireUser } from './lib';
import { queuePush, mapsLink } from './notify';

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
 * Rood: "Ik voel me niet veilig" — start incident + push naar contacten.
 * Alarm/zaklamp starten client-side na server-bevestiging; PIN vereist om te stoppen.
 * Geen automatische 112.
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
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `incident:${uid}`, 10, 10 * 60_000);
    const existing = await ctx.db.query('alerts').withIndex('by_client_ref', (q) => q.eq('clientRef', a.clientRef)).first();
    if (existing) {
      if (existing.userId !== uid) fail('FORBIDDEN');
      const inc = await ctx.db.query('incidents').withIndex('by_user_status', (q) => q.eq('userId', uid).eq('status', 'active')).first();
      return { incidentId: inc?._id ?? null, alertId: existing._id };
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
    const contacts = await ctx.db.query('trustedContacts').withIndex('by_owner', (q) => q.eq('ownerId', uid).eq('status', 'accepted')).collect();
    const name = await displayName(ctx, uid);
    const link = mapsLink(fresh ? a.lat : undefined, fresh ? a.lng : undefined);
    if (contacts.length) {
      await queuePush(ctx, {
        kind: 'unsafe', alertId, sessionId, recipients: contacts.map((c) => c.contactId),
        title: `🆘 ${name} voelt zich niet veilig`,
        body: link
          ? `${name} heeft "Ik voel me niet veilig" geactiveerd. Locatie: ${link}. SafeWalk belt niet 112.`
          : `${name} heeft "Ik voel me niet veilig" geactiveerd. Geen recente locatie. SafeWalk belt niet 112.`,
      });
    }
    await audit(ctx, uid, 'incident.unsafe', incidentId, { recipients: contacts.length, torch: torchOk });
    return { incidentId, alertId };
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
