import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { closeSession } from './sessions';
import { audit, RETENTION_AFTER_END_MS, RETENTION_MAX_MS } from './lib';

/** Elke minuut (cron): verlopen sessies sluiten en gemiste check-ins escaleren — onafhankelijk van de app. */
export const checkDeadlines = internalMutation({ args: {}, handler: async (ctx) => {
  const now = Date.now();
  for (const s of await ctx.db.query('sessions').withIndex('by_open', (q) => q.eq('endedAt', undefined)).collect())
    if (s.expiresAt <= now) await closeSession(ctx, s._id, 'expired');

  const due = await ctx.db.query('checkIns').withIndex('by_status_due', (q) => q.eq('status', 'pending').lt('dueAt', now)).collect();
  let escalated = 0;
  for (const c of due) {
    if (c.dueAt + c.graceMinutes * 60_000 >= now) continue;
    const s = await ctx.db.get(c.sessionId);
    if (!s || s.endedAt !== undefined) continue;
    await ctx.db.patch(c._id, { status: 'missed', escalatedAt: now });
    await ctx.db.patch(s._id, { status: 'alert' });
    const last = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', s._id)).order('desc').first();
    const alertId = await ctx.db.insert('alerts', { userId: s.userId, sessionId: s._id, kind: 'missed_check_in', status: 'open',
      lat: last?.lat, lng: last?.lng, accuracyM: last?.accuracyM, locationAt: last?.recordedAt });
    for (const vw of await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', s._id)).collect())
      if (vw.revokedAt === undefined) await ctx.db.insert('deliveries', { alertId, recipientId: vw.viewerId, status: 'queued' });
    await audit(ctx, undefined, 'check_in.escalated', s._id);
    await ctx.scheduler.runAfter(0, internal.push.sendAlert, { alertId });
    escalated++;
  }
  return escalated;
} });

/** Bewaarbeleid: locaties 24 u na einde reis weg, nooit langer dan 3 dagen; alert-coördinaten na 30 dagen gewist. */
export const purge = internalMutation({ args: {}, handler: async (ctx) => {
  const now = Date.now(); let n = 0;
  for (const s of await ctx.db.query('sessions').collect()) {
    const old = (s.endedAt !== undefined && s.endedAt < now - RETENTION_AFTER_END_MS);
    const rows = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', s._id)).collect();
    for (const r of rows) if (old || r._creationTime < now - RETENTION_MAX_MS) { await ctx.db.delete(r._id); n++; }
  }
  for (const a of await ctx.db.query('alerts').collect())
    if (a._creationTime < now - 30 * 24 * 3600_000 && a.lat !== undefined) await ctx.db.patch(a._id, { lat: undefined, lng: undefined, accuracyM: undefined });
  for (const r of await ctx.db.query('rateLimits').collect()) if (r.windowStart < now - 24 * 3600_000) await ctx.db.delete(r._id);
  return n;
} });
