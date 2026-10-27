import { internalMutation } from './_generated/server';
import { queuePush, mapsLink } from './notify';
import { closeSession } from './sessions';
import { detectSignals, signalText, COOLDOWN_MS } from './motion';
import { audit, displayName, isPremium, RETENTION_AFTER_END_MS, RETENTION_MAX_MS } from './lib';

/** Elke minuut (cron): verlopen sessies sluiten en gemiste check-ins escaleren — onafhankelijk van de app. */
export const checkDeadlines = internalMutation({ args: {}, handler: async (ctx) => {
  const now = Date.now();
  for (const s of await ctx.db.query('sessions').withIndex('by_open', (q) => q.eq('endedAt', undefined)).collect())
    if (s.expiresAt <= now) await closeSession(ctx, s._id, 'expired');

  // Check-in vereist: herinnering aan de gebruiker zelf zodra de verwachte aankomst verstreken is
  for (const c of await ctx.db.query('checkIns').withIndex('by_status_due', (q) => q.eq('status', 'pending').lt('dueAt', now)).collect()) {
    if (c.reminderSentAt !== undefined) continue;
    await ctx.db.patch(c._id, { reminderSentAt: now });
    await queuePush(ctx, { kind: 'check_in_required', sessionId: c.sessionId, recipients: [c.userId], title: 'Alles goed?',
      body: `Je verwachte aankomsttijd is verstreken. Bevestig binnen ${c.graceMinutes} min dat je veilig bent, of verleng.` });
  }

  // Optionele bewegingsdetectie (premium, opt-in): alleen een extra check-in aan de gebruiker zelf
  for (const s of await ctx.db.query('sessions').withIndex('by_open', (q) => q.eq('endedAt', undefined)).collect()) {
    const p = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', s.userId)).first();
    if (!p?.motionDetection || !(await isPremium(ctx, s.userId))) continue;
    const locations = (await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', s._id)).order('desc').take(120)).reverse();
    const kinds = detectSignals({ locations, now, sessionStart: s._creationTime, startDistanceM: s.startDistanceM,
      dest: s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng } : undefined });
    const recent = (await ctx.db.query('motionSignals').withIndex('by_session', (q) => q.eq('sessionId', s._id)).collect()).filter((x) => x._creationTime > now - COOLDOWN_MS);
    for (const kind of kinds) {
      if (recent.some((r) => r.kind === kind)) continue;
      await ctx.db.insert('motionSignals', { sessionId: s._id, userId: s.userId, kind, status: 'open' });
      await queuePush(ctx, { kind: 'motion_check', sessionId: s._id, recipients: [s.userId], title: 'Extra check-in', body: signalText[kind] + ' Open SafeWalk om te bevestigen.' });
    }
  }

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
    const viewers = (await ctx.db.query('sessionViewers').withIndex('by_session', (q) => q.eq('sessionId', s._id)).collect()).filter((x) => x.revokedAt === undefined).map((x) => x.viewerId);
    const name = await displayName(ctx, s.userId); const link = mapsLink(last?.lat, last?.lng);
    await queuePush(ctx, { kind: 'missed_check_in', alertId, sessionId: s._id, recipients: viewers, title: `⚠️ ${name} heeft niet ingecheckt`,
      body: `${name} heeft niet op tijd bevestigd veilig te zijn. ${link ? `Laatst bekende locatie: ${link}` : 'Geen recente locatie.'} Probeer contact op te nemen.` });
    await queuePush(ctx, { kind: 'check_in_required', sessionId: s._id, recipients: [s.userId], title: 'Check-in gemist',
      body: 'Je contacten zijn gewaarschuwd. Open SafeWalk om te bevestigen dat alles goed is.' });
    await audit(ctx, undefined, 'check_in.escalated', s._id);
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
