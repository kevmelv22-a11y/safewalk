import { mutation, query, MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
import { ageStatus } from './age';
import { queuePush, mapsLink } from './notify';
import {
  acceptedContact, activeChildLink, audit, CHILD_CONSENT_VERSION, displayName, fail, rateLimit,
  requireAdult, requireAdultOrLinkedChild, requireUser, sessionOpen, sha256Hex,
} from './lib';
import { closeSession } from './sessions';

const H = 3600_000;
const INVITE_TTL_MS = 30 * 60_000;
const SHARE_MS = 8 * H;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function inviteCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

async function closeChildSessions(ctx: MutationCtx, childId: Id<'users'>, linkId: Id<'childLinks'>) {
  for (const s of await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', childId)).collect()) {
    if (s.endedAt === undefined && s.childLinkId === linkId) await closeSession(ctx, s._id, 'ended', 'stopped');
  }
}

/** Ouder (16+) geeft toestemming en krijgt een eenmalige koppelcode (30 min). Geen identiteitscontrole. */
export const createInvite = mutation({
  args: { consentAccepted: v.boolean() },
  handler: async (ctx, { consentAccepted }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    if (!consentAccepted) fail('CONSENT_REQUIRED');
    await rateLimit(ctx, `child-invite:${uid}`, 10, H);
    const open = (await ctx.db.query('childLinks').withIndex('by_parent', (q) => q.eq('parentId', uid)).collect())
      .filter((l) => l.status === 'active' || l.status === 'pending');
    if (open.filter((l) => l.status === 'active').length >= 3) fail('CHILD_LIMIT');
    if (open.filter((l) => l.status === 'pending').length >= 5) fail('CHILD_LIMIT');
    const code = inviteCode();
    const now = Date.now();
    const id = await ctx.db.insert('childLinks', {
      parentId: uid, status: 'pending', inviteHash: await sha256Hex(code),
      inviteExpiresAt: now + INVITE_TTL_MS, consentAt: now, consentVersion: CHILD_CONSENT_VERSION, createdAt: now,
    });
    await audit(ctx, uid, 'child.invite', id, { version: CHILD_CONSENT_VERSION });
    return { linkId: id, code, expiresAt: now + INVITE_TTL_MS };
  },
});

/** Kind (13–15) voert de code van de ouder in. Een code van het kind zelf telt niet als toestemming. */
export const acceptInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const uid = await requireUser(ctx);
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    const status = ageStatus(p?.birthYear, p?.birthMonth);
    if (status === 'unknown') fail('AGE_REQUIRED');
    if (status === 'under13') fail('AGE_UNDER_13');
    if (status === 'adult') fail('CHILD_MUST_BE_MINOR');
    const existing = await activeChildLink(ctx, uid);
    if (existing) fail('ALREADY_LINKED');
    const raw = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length < 6 || raw.length > 12) fail('INVITE_INVALID');
    await rateLimit(ctx, `child-accept:${uid}`, 8, H);
    const hash = await sha256Hex(raw);
    const link = await ctx.db.query('childLinks').withIndex('by_invite', (q) => q.eq('inviteHash', hash)).first();
    if (!link || link.status !== 'pending' || !link.inviteExpiresAt || link.inviteExpiresAt < Date.now()) fail('INVITE_INVALID');
    const invite = link!;
    if (invite.parentId === uid) fail('INVITE_SELF');
    await ctx.db.patch(invite._id, {
      childId: uid, status: 'active', acceptedAt: Date.now(), inviteHash: undefined, inviteExpiresAt: undefined,
    });
    await audit(ctx, uid, 'child.accepted', invite._id);
    const childName = await displayName(ctx, uid);
    await queuePush(ctx, {
      kind: 'arrived_safe', recipients: [invite.parentId],
      title: `${childName} is gekoppeld`,
      body: `${childName} heeft je koppelcode gebruikt. Kindermodus staat klaar. Je kunt de koppeling altijd intrekken.`,
    });
    return { linkId: invite._id };
  },
});

export const revoke = mutation({
  args: { linkId: v.id('childLinks') },
  handler: async (ctx, { linkId }) => {
    const uid = await requireUser(ctx);
    const link = await ctx.db.get(linkId);
    if (!link) fail('NOT_FOUND');
    const row = link!;
    if (row.parentId !== uid && row.childId !== uid) fail('FORBIDDEN');
    if (row.status === 'revoked') return;
    await ctx.db.patch(linkId, { status: 'revoked', revokedAt: Date.now(), inviteHash: undefined, inviteExpiresAt: undefined });
    if (row.childId) await closeChildSessions(ctx, row.childId, linkId);
    await audit(ctx, uid, 'child.revoked', linkId);
  },
});

export const setContacts = mutation({
  args: { linkId: v.id('childLinks'), contactIds: v.array(v.id('users')) },
  handler: async (ctx, { linkId, contactIds }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const link = await ctx.db.get(linkId);
    if (!link || link.parentId !== uid || link.status !== 'active') fail('NOT_FOUND');
    const active = link!;
    if (contactIds.length > 10) fail('BAD_REQUEST');
    const ids = [...new Set(contactIds)];
    for (const id of ids) {
      if (id === uid || id === active.childId) fail('BAD_REQUEST');
      if (!(await acceptedContact(ctx, uid, id))) fail('VIEWER_NOT_TRUSTED');
    }
    await ctx.db.patch(linkId, { contactIds: ids });
    await audit(ctx, uid, 'child.contacts', linkId, { count: ids.length });
  },
});

export const setGeofence = mutation({
  args: {
    linkId: v.id('childLinks'),
    kind: v.union(v.literal('home'), v.literal('school')),
    label: v.optional(v.string()),
    lat: v.number(), lng: v.number(), radiusM: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const link = await ctx.db.get(a.linkId);
    if (!link || link.parentId !== uid || link.status !== 'active' || !link.childId) fail('NOT_FOUND');
    const childId = link!.childId!;
    if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) fail('BAD_REQUEST');
    const radiusM = Math.min(2000, Math.max(50, Math.round(a.radiusM ?? 150)));
    const label = (a.label ?? (a.kind === 'home' ? 'Thuis' : 'School')).trim().slice(0, 40);
    const existing = await ctx.db.query('geofences').withIndex('by_link_kind', (q) => q.eq('linkId', a.linkId).eq('kind', a.kind)).first();
    if (existing) await ctx.db.patch(existing._id, { lat: a.lat, lng: a.lng, radiusM, label, lastInside: undefined, lastEventAt: undefined });
    else await ctx.db.insert('geofences', {
      linkId: a.linkId, parentId: uid, childId, kind: a.kind, label, lat: a.lat, lng: a.lng, radiusM,
    });
    await audit(ctx, uid, 'child.geofence', a.linkId, { kind: a.kind });
  },
});

export const clearGeofence = mutation({
  args: { linkId: v.id('childLinks'), kind: v.union(v.literal('home'), v.literal('school')) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const link = await ctx.db.get(a.linkId);
    if (!link || link.parentId !== uid) fail('NOT_FOUND');
    for (const f of await ctx.db.query('geofences').withIndex('by_link_kind', (q) => q.eq('linkId', a.linkId).eq('kind', a.kind)).collect()) {
      await ctx.db.delete(f._id);
    }
  },
});

/** Start of verleng het locatiedelen van het kind met de ouder. Geen “Altijd”-locatie. */
export const startShare = mutation({
  args: {},
  handler: async (ctx) => {
    const uid = await requireUser(ctx);
    const { link } = await requireAdultOrLinkedChild(ctx, uid);
    if (!link) fail('AGE_PARENT_REQUIRED');
    const childLink = link!;
    await rateLimit(ctx, `child-share:${uid}`, 20, H);
    const now = Date.now();
    const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      .find((s) => s.endedAt === undefined && s.childLinkId === childLink._id);
    if (open && sessionOpen(open)) {
      const expectedArrival = now + SHARE_MS;
      await ctx.db.patch(open._id, { expectedArrival, expiresAt: expectedArrival + 2 * H, status: 'active' });
      return open._id;
    }
    for (const s of await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      if (s.endedAt === undefined) await closeSession(ctx, s._id, 'ended', 'replaced');
    const expectedArrival = now + SHARE_MS;
    const id = await ctx.db.insert('sessions', {
      userId: uid, destinationLabel: 'Delen met ouder', expectedArrival, status: 'active',
      expiresAt: expectedArrival + 2 * H, childLinkId: childLink._id, kind: 'timer',
    });
    await ctx.db.insert('sessionViewers', { sessionId: id, viewerId: childLink.parentId });
    const name = await displayName(ctx, uid);
    await queuePush(ctx, {
      kind: 'trip_started', sessionId: id, recipients: [childLink.parentId],
      title: `${name} deelt locatie`,
      body: `${name} deelt nu locatie met je, zolang SafeWalk op de telefoon loopt of de zichtbare locatiemelding aanstaat. Geen 24-uurs achtergrondlocatie.`,
    });
    await audit(ctx, uid, 'child.share', id);
    return id;
  },
});

export const stopShare = mutation({
  args: {},
  handler: async (ctx) => {
    const uid = await requireUser(ctx);
    const { link } = await requireAdultOrLinkedChild(ctx, uid);
    if (!link) fail('AGE_PARENT_REQUIRED');
    await closeChildSessions(ctx, uid, link!._id);
  },
});

export const arrived = mutation({
  args: { place: v.union(v.literal('home'), v.literal('school')), lat: v.optional(v.number()), lng: v.optional(v.number()), locationAt: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    const { link } = await requireAdultOrLinkedChild(ctx, uid);
    if (!link) fail('AGE_PARENT_REQUIRED');
    const childLink = link!;
    await rateLimit(ctx, `child-arrived:${uid}`, 20, H);
    const name = await displayName(ctx, uid);
    const where = a.place === 'home' ? 'thuis' : 'school';
    const maps = mapsLink(a.lat, a.lng);
    const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect()).find((s) => sessionOpen(s));
    const alertId = await ctx.db.insert('alerts', {
      userId: uid, kind: 'child_arrived', sessionId: open?._id, status: 'open',
      lat: a.lat, lng: a.lng, locationAt: a.locationAt,
      clientRef: `arrived:${uid}:${a.place}:${Math.floor(Date.now() / 60_000)}`,
    });
    await queuePush(ctx, {
      kind: 'child_arrived', alertId, sessionId: open?._id, recipients: [childLink.parentId],
      title: `${name} is veilig ${where}`,
      body: maps
        ? `${name} geeft aan veilig ${where} te zijn aangekomen. Locatie: ${maps}. SafeWalk belt niet 112.`
        : `${name} geeft aan veilig ${where} te zijn aangekomen. SafeWalk belt niet 112.`,
    });
    await audit(ctx, uid, 'child.arrived', alertId, { place: a.place });
    return alertId;
  },
});

export const myLink = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx); if (!uid) return null;
    const link = await activeChildLink(ctx, uid);
    if (!link) return null;
    const parent = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', link.parentId)).first();
    const contacts = await Promise.all((link.contactIds ?? []).map(async (id) => ({
      userId: id, name: (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', id)).first())?.displayName ?? 'Contact',
    })));
    const fences = await ctx.db.query('geofences').withIndex('by_link', (q) => q.eq('linkId', link._id)).collect();
    const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', uid)).collect())
      .find((s) => s.endedAt === undefined && s.childLinkId === link._id);
    return {
      linkId: link._id,
      parentId: link.parentId,
      parentName: parent?.displayName ?? 'Ouder',
      contactNames: contacts.map((c) => c.name),
      fences: fences.map((f) => ({ kind: f.kind, label: f.label })),
      sharing: !!open,
      sessionId: open?._id ?? null,
      sessionExpiresAt: open?.expiresAt ?? null,
    };
  },
});

export const listForParent = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx); if (!uid) return [];
    const rows = await ctx.db.query('childLinks').withIndex('by_parent', (q) => q.eq('parentId', uid)).collect();
    const out = [];
    for (const l of rows) {
      if (l.status === 'revoked') continue;
      const child = l.childId
        ? await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', l.childId!)).first()
        : null;
      out.push({
        linkId: l._id, status: l.status, childId: l.childId ?? null,
        childName: child?.displayName ?? (l.status === 'pending' ? 'Nog niet gekoppeld' : 'Kind'),
        expiresAt: l.inviteExpiresAt ?? null, acceptedAt: l.acceptedAt ?? null,
      });
    }
    return out;
  },
});

const STALE_MS = 10 * 60_000;

export const parentChildStatus = query({
  args: { linkId: v.id('childLinks') },
  handler: async (ctx, { linkId }) => {
    const uid = await getAuthUserId(ctx); if (!uid) return null;
    const link = await ctx.db.get(linkId);
    if (!link || link.parentId !== uid || link.status === 'revoked') return null;
    const childName = link.childId
      ? (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', link.childId!)).first())?.displayName ?? 'Kind'
      : null;
    const fences = await ctx.db.query('geofences').withIndex('by_link', (q) => q.eq('linkId', linkId)).collect();
    const contacts = await Promise.all((link.contactIds ?? []).map(async (id) => ({
      userId: id, name: (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', id)).first())?.displayName ?? 'Contact',
    })));
    const fenceView = fences.map((f) => ({ kind: f.kind, label: f.label, lat: f.lat, lng: f.lng, radiusM: f.radiusM, lastInside: f.lastInside ?? null }));
    if (!link.childId || link.status !== 'active') {
      return {
        linkId, status: link.status, childId: link.childId ?? null, childName,
        sharing: false, last: null, stale: false, disconnected: false,
        batteryPct: null, lastSeenAt: null, fences: fenceView, contacts, sessionId: null,
      };
    }
    const childId = link.childId!;
    const open = (await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', childId)).collect())
      .find((s) => s.endedAt === undefined && s.childLinkId === linkId) ?? null;
    const last = open
      ? await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', open._id)).order('desc').first()
      : null;
    const lastSeenAt = open?.lastSeenAt ?? last?.recordedAt ?? null;
    const stale = !lastSeenAt || Date.now() - lastSeenAt > STALE_MS;
    return {
      linkId, status: link.status, childId: link.childId, childName,
      sharing: !!open, sessionId: open?._id ?? null,
      last: last ? { lat: last.lat, lng: last.lng, accuracyM: last.accuracyM ?? null, recordedAt: last.recordedAt } : null,
      lastSeenAt, batteryPct: open?.batteryPct ?? null, stale, disconnected: !open || stale,
      fences: fenceView,
      contacts,
    };
  },
});
