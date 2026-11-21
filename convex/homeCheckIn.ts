import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { queuePush } from './notify';
import { acceptedContact, audit, displayName, fail, rateLimit, requireAdult, requireUser } from './lib';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  HOME_GRACE_MINUTES,
  HOME_MAX_ACTIVE,
  HOME_REMINDER_BEFORE_MS,
  checkedInBody,
  cleanLabel,
  dueWindowError,
  escalationIsDue,
  extendAllowed,
  missedContactBody,
  missedOwnerBody,
  parsePoint,
  reminderBody,
  reminderIsDue,
  type ParsedPoint,
} from './homeCheckInLogic';

/**
 * Thuis-check-in, los van een reis.
 * Alleen 16+. Onder 16 (ook kindermodus) blijft dit dicht: een kind gebruikt
 * "Ik ben veilig thuis", dat alleen naar de gekoppelde ouder gaat.
 * Herinnering en escalatie staan als geplande Convex-functie, plus een vangnet in de minuut-cron,
 * zodat het ook loopt als de app dicht is. Aflevering van push is niet zeker.
 */

const pointArgs = {
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  accuracyM: v.optional(v.number()),
  locationAt: v.optional(v.number()),
};

async function cancelJob(ctx: MutationCtx, jobId: Id<'_scheduled_functions'> | undefined) {
  if (jobId === undefined) return;
  const job = await ctx.db.system.get(jobId);
  if (job !== null && job.state.kind === 'pending') await ctx.scheduler.cancel(jobId);
}

async function arm(ctx: MutationCtx, id: Id<'homeCheckIns'>, dueAt: number, graceMinutes: number, generation: number) {
  const row = await ctx.db.get(id);
  if (row) {
    await cancelJob(ctx, row.reminderJobId);
    await cancelJob(ctx, row.escalateJobId);
  }
  const now = Date.now();
  const soon = now + 500;
  const reminderJobId = await ctx.scheduler.runAt(
    Math.max(soon, dueAt - HOME_REMINDER_BEFORE_MS),
    internal.homeCheckIn.remind,
    { id, generation },
  );
  const escalateJobId = await ctx.scheduler.runAt(
    Math.max(soon + 500, dueAt + graceMinutes * 60_000),
    internal.homeCheckIn.escalate,
    { id, generation },
  );
  await ctx.db.patch(id, { reminderJobId, escalateJobId });
}

async function liveViewers(ctx: MutationCtx, row: Doc<'homeCheckIns'>) {
  const ids: Id<'users'>[] = [];
  for (const vid of row.viewerIds) if (await acceptedContact(ctx, row.userId, vid)) ids.push(vid);
  return ids;
}

async function resolvePoint(ctx: MutationCtx, row: Doc<'homeCheckIns'>): Promise<ParsedPoint | null> {
  if (row.lat !== undefined && row.lng !== undefined && row.locationAt !== undefined) {
    return {
      lat: row.lat, lng: row.lng, locationAt: row.locationAt,
      ...(row.accuracyM !== undefined ? { accuracyM: row.accuracyM } : {}),
    };
  }
  let best: ParsedPoint | null = null;
  for (const s of await ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', row.userId)).collect()) {
    if (s.endedAt !== undefined) continue;
    const loc = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', s._id)).order('desc').first();
    if (!loc) continue;
    if (!best || loc.recordedAt > best.locationAt) {
      best = {
        lat: loc.lat, lng: loc.lng, locationAt: loc.recordedAt,
        ...(loc.accuracyM !== undefined ? { accuracyM: loc.accuracyM } : {}),
      };
    }
  }
  return best;
}

async function sendReminder(ctx: MutationCtx, id: Id<'homeCheckIns'>, generation: number | null, now: number) {
  const row = await ctx.db.get(id);
  if (!row || row.status !== 'pending') return;
  if (generation !== null && row.generation !== generation) return;
  if (row.remindedGeneration === row.generation) return;
  if (!reminderIsDue(row.dueAt, now)) return;
  await queuePush(ctx, {
    kind: 'check_in_required', recipients: [row.userId], title: 'Thuis-check-in',
    body: reminderBody(row.label, row.graceMinutes), data: { homeCheckInId: row._id },
  });
  await ctx.db.patch(row._id, { remindedGeneration: row.generation });
  await audit(ctx, row.userId, 'home_checkin.reminded', row._id);
}

async function sendEscalation(ctx: MutationCtx, id: Id<'homeCheckIns'>, generation: number | null, now: number) {
  const row = await ctx.db.get(id);
  if (!row || row.status !== 'pending') return;
  if (generation !== null && row.generation !== generation) return;
  if (!escalationIsDue(row.dueAt, row.graceMinutes, now)) return;
  const point = await resolvePoint(ctx, row);
  const alertId = await ctx.db.insert('alerts', {
    userId: row.userId, kind: 'missed_check_in', clientRef: `home-${row._id}`, status: 'open',
    ...(point ? { lat: point.lat, lng: point.lng, locationAt: point.locationAt, ...(point.accuracyM !== undefined ? { accuracyM: point.accuracyM } : {}) } : {}),
  });
  await ctx.db.patch(row._id, {
    status: 'missed', escalatedAt: now, alertId,
    ...(point && row.lat === undefined ? { lat: point.lat, lng: point.lng, locationAt: point.locationAt, ...(point.accuracyM !== undefined ? { accuracyM: point.accuracyM } : {}) } : {}),
  });
  const viewers = await liveViewers(ctx, row);
  const name = await displayName(ctx, row.userId);
  if (viewers.length) {
    await queuePush(ctx, {
      kind: 'missed_check_in', alertId, recipients: viewers,
      title: `⚠️ ${name} heeft thuiskomst niet bevestigd`,
      body: missedContactBody(name, row.label, point, now),
    });
  }
  await queuePush(ctx, {
    kind: 'check_in_required', recipients: [row.userId], title: 'Thuis-check-in gemist',
    body: missedOwnerBody(row.label, viewers.length > 0), data: { homeCheckInId: row._id },
  });
  await audit(ctx, undefined, 'home_checkin.escalated', row._id, { viewers: viewers.length, location: point !== null });
}

export async function sweepHomeCheckIns(ctx: MutationCtx, now = Date.now()) {
  const due = await ctx.db.query('homeCheckIns').withIndex('by_status_due', (q) => q.eq('status', 'pending').lt('dueAt', now + HOME_REMINDER_BEFORE_MS + 20_000)).collect();
  for (const row of due) {
    await sendReminder(ctx, row._id, null, now);
    await sendEscalation(ctx, row._id, null, now);
  }
}

async function ownPending(ctx: MutationCtx, id: Id<'homeCheckIns'>, uid: Id<'users'>) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== uid) fail('CHECKIN_NOT_FOUND');
  return row!;
}

export const start = mutation({
  args: { label: v.string(), dueAt: v.number(), viewerIds: v.array(v.id('users')), ...pointArgs },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const savedLabel = cleanLabel(args.label) ?? '';
    if (!savedLabel) fail('INVALID_LABEL');
    if (dueWindowError(args.dueAt, Date.now())) fail('INVALID_DUE');
    const parsed = parsePoint(args, Date.now());
    if (parsed === 'bad') fail('INVALID_LOCATION');
    const savedPoint = parsed === 'bad' ? null : parsed;
    const profile = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (profile?.restricted) fail('RESTRICTED');
    await rateLimit(ctx, `homecheckin:${uid}`, 30, 3600_000);
    const viewers = [...new Set(args.viewerIds)];
    if (viewers.length === 0 || viewers.length > 20) fail('NO_VIEWERS');
    for (const vid of viewers) {
      if (vid === uid || !(await acceptedContact(ctx, uid, vid))) fail('VIEWER_NOT_TRUSTED');
    }
    const open = (await ctx.db.query('homeCheckIns').withIndex('by_user', (q) => q.eq('userId', uid)).collect()).filter((r) => r.status === 'pending');
    if (open.length >= HOME_MAX_ACTIVE) fail('TOO_MANY_CHECKINS');
    const id = await ctx.db.insert('homeCheckIns', {
      userId: uid, label: savedLabel, dueAt: args.dueAt, graceMinutes: HOME_GRACE_MINUTES, extensions: 0, generation: 1,
      status: 'pending', viewerIds: viewers,
      ...(savedPoint ? { lat: savedPoint.lat, lng: savedPoint.lng, locationAt: savedPoint.locationAt, ...(savedPoint.accuracyM !== undefined ? { accuracyM: savedPoint.accuracyM } : {}) } : {}),
    });
    await arm(ctx, id, args.dueAt, HOME_GRACE_MINUTES, 1);
    await audit(ctx, uid, 'home_checkin.started', id, { viewers: viewers.length, location: savedPoint !== null });
    return id;
  },
});

export const confirm = mutation({
  args: { id: v.id('homeCheckIns') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const row = await ownPending(ctx, id, uid);
    if (row!.status !== 'pending' && row!.status !== 'missed') fail('CHECKIN_CLOSED');
    const afterMiss = row!.status === 'missed';
    const now = Date.now();
    await cancelJob(ctx, row!.reminderJobId);
    await cancelJob(ctx, row!.escalateJobId);
    await ctx.db.patch(id, { status: 'confirmed', respondedAt: now });
    if (row!.alertId) {
      const alert = await ctx.db.get(row!.alertId);
      if (alert && alert.status === 'open') await ctx.db.patch(alert._id, { status: 'resolved' });
    }
    const viewers = await liveViewers(ctx, row!);
    if (viewers.length) {
      const name = await displayName(ctx, uid);
      await queuePush(ctx, {
        kind: 'home_checked_in', recipients: viewers, title: `${name} geeft aan thuis te zijn`,
        body: checkedInBody(name, row!.label, afterMiss), data: { homeCheckInId: id },
      });
    }
    await audit(ctx, uid, 'home_checkin.confirmed', id, { afterMiss });
  },
});

export const extend = mutation({
  args: { id: v.id('homeCheckIns'), minutes: v.number() },
  handler: async (ctx, { id, minutes }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const row = await ownPending(ctx, id, uid);
    if (row!.status !== 'pending') fail('EXTENSION_NOT_ALLOWED');
    if (!extendAllowed(row!.extensions, minutes)) fail(row!.extensions >= 3 ? 'EXTENSION_NOT_ALLOWED' : 'INVALID_EXTEND');
    const dueAt = Math.max(row!.dueAt, Date.now()) + minutes * 60_000;
    if (dueWindowError(dueAt, Date.now())) fail('INVALID_DUE');
    const generation = row!.generation + 1;
    await ctx.db.patch(id, { dueAt, extensions: row!.extensions + 1, generation, status: 'pending' });
    await arm(ctx, id, dueAt, row!.graceMinutes, generation);
    await audit(ctx, uid, 'home_checkin.extended', id, { minutes });
    return dueAt;
  },
});

export const cancel = mutation({
  args: { id: v.id('homeCheckIns') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const row = await ownPending(ctx, id, uid);
    if (row!.status !== 'pending') fail('CHECKIN_CLOSED');
    await cancelJob(ctx, row!.reminderJobId);
    await cancelJob(ctx, row!.escalateJobId);
    await ctx.db.patch(id, { status: 'cancelled', respondedAt: Date.now() });
    await audit(ctx, uid, 'home_checkin.cancelled', id);
  },
});

/** Werkt de laatst bekende locatie bij op alle lopende thuis-check-ins. Geen punt = niets meesturen. */
export const updateLocation = mutation({
  args: pointArgs,
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    const parsed = parsePoint(args, Date.now());
    if (parsed === null || parsed === 'bad') fail('INVALID_LOCATION');
    const saved = parsed === null || parsed === 'bad' ? { lat: 0, lng: 0, locationAt: Date.now() } : parsed;
    await rateLimit(ctx, `homecheckin-loc:${uid}`, 240, 3600_000);
    const rows = (await ctx.db.query('homeCheckIns').withIndex('by_user', (q) => q.eq('userId', uid)).collect()).filter((r) => r.status === 'pending');
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        lat: saved.lat, lng: saved.lng, locationAt: saved.locationAt,
        ...(saved.accuracyM !== undefined ? { accuracyM: saved.accuracyM } : {}),
      });
    }
    return rows.length;
  },
});

const publicRow = (row: Doc<'homeCheckIns'>) => ({
  _id: row._id,
  _creationTime: row._creationTime,
  label: row.label,
  dueAt: row.dueAt,
  graceMinutes: row.graceMinutes,
  extensions: row.extensions,
  status: row.status,
  respondedAt: row.respondedAt,
  escalatedAt: row.escalatedAt,
  locationAt: row.locationAt,
  locationKnown: row.lat !== undefined && row.lng !== undefined,
  viewerIds: row.viewerIds,
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return { pending: [], recent: [] };
    const rows = await ctx.db.query('homeCheckIns').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    const day = Date.now() - 24 * 3600_000;
    return {
      pending: rows.filter((r) => r.status === 'pending').sort((a, b) => a.dueAt - b.dueAt).map(publicRow),
      recent: rows.filter((r) => r.status !== 'pending' && r._creationTime > day).sort((a, b) => b._creationTime - a._creationTime).map(publicRow),
    };
  },
});

export const get = query({
  args: { id: v.id('homeCheckIns') },
  handler: async (ctx, { id }) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    const row = await ctx.db.get(id);
    if (!row || row.userId !== uid) return null;
    const viewerNames = await Promise.all(row.viewerIds.map(async (vid) => ({ viewerId: vid, name: await displayName(ctx, vid) })));
    return { ...publicRow(row), viewerNames };
  },
});

export const remind = internalMutation({
  args: { id: v.id('homeCheckIns'), generation: v.number() },
  handler: async (ctx, { id, generation }) => { await sendReminder(ctx, id, generation, Date.now()); },
});

export const escalate = internalMutation({
  args: { id: v.id('homeCheckIns'), generation: v.number() },
  handler: async (ctx, { id, generation }) => { await sendEscalation(ctx, id, generation, Date.now()); },
});
