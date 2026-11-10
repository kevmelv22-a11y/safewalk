import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { TableNames } from './_generated/dataModel';
import { audit, fail, isAdmin, rateLimit, requireUser } from './lib';

/** Verwijdert account + alle gekoppelde data, incl. locatiegeschiedenis en auth-gegevens. */
export const deleteAccount = mutation({ args: { confirm: v.string() }, handler: async (ctx, { confirm }) => {
  const uid = await requireUser(ctx);
  if (confirm !== 'VERWIJDER') fail('CONFIRMATION_REQUIRED');
  await rateLimit(ctx, `delete:${uid}`, 3, 3600_000);
  const del = async (rows: { _id: any }[]) => { for (const r of rows) await ctx.db.delete(r._id); };
  const q = <T extends TableNames>(t: T) => ctx.db.query(t);
  await del(await q('locations').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  for (const s of await q('sessions').withIndex('by_user', (x) => x.eq('userId', uid)).collect()) {
    await del(await q('sessionViewers').withIndex('by_session', (x) => x.eq('sessionId', s._id)).collect());
    await del(await q('checkIns').withIndex('by_session', (x) => x.eq('sessionId', s._id)).collect());
    await del(await q('motionSignals').withIndex('by_session', (x) => x.eq('sessionId', s._id)).collect());
    await del(await q('pushMessages').withIndex('by_session', (x) => x.eq('sessionId', s._id)).collect());
    await ctx.db.delete(s._id);
  }
  await del(await q('sessionViewers').withIndex('by_viewer', (x) => x.eq('viewerId', uid)).collect());
  for (const a of await q('alerts').withIndex('by_user', (x) => x.eq('userId', uid)).collect()) {
    await del(await q('pushMessages').withIndex('by_alert', (x) => x.eq('alertId', a._id)).collect());
    await ctx.db.delete(a._id);
  }
  await del(await q('pushMessages').withIndex('by_recipient', (x) => x.eq('recipientId', uid)).collect());
  await del(await q('trustedContacts').withIndex('by_owner', (x) => x.eq('ownerId', uid)).collect());
  await del(await q('trustedContacts').withIndex('by_contact', (x) => x.eq('contactId', uid)).collect());
  await del(await q('invitations').withIndex('by_inviter', (x) => x.eq('inviterId', uid)).collect());
  await del(await q('blocks').withIndex('by_pair', (x) => x.eq('blockerId', uid)).collect());
  await del(await q('pushTokens').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  await del(await q('profiles').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  await del(await q('subscriptions').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  await del(await q('abuseReports').withIndex('by_reporter', (x) => x.eq('reporterId', uid)).collect());
  // Recordings + E2E envelopes/keys (storage blobs)
  for (const rec of await q('recordings').withIndex('by_user', (x) => x.eq('userId', uid)).collect()) {
    try { await ctx.storage.delete(rec.storageId); } catch { /* */ }
    await del(await q('recordingKeyEnvelopes').withIndex('by_recording', (x) => x.eq('recordingId', rec._id)).collect());
    await ctx.db.delete(rec._id);
  }
  await del(await q('recordingKeyEnvelopes').withIndex('by_recipient', (x) => x.eq('recipientId', uid)).collect());
  await del(await q('deviceCryptoKeys').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  for (const link of await q('shareLinks').withIndex('by_user', (x) => x.eq('userId', uid)).collect()) {
    if (!link.revokedAt) await ctx.db.patch(link._id, { revokedAt: Date.now() });
    await ctx.db.delete(link._id);
  }
  await del(await q('deviceContacts').withIndex('by_user', (x) => x.eq('userId', uid)).collect());
  const incidentRows = [
    ...await q('incidents').withIndex('by_user_status', (x) => x.eq('userId', uid).eq('status', 'active')).collect(),
    ...await q('incidents').withIndex('by_user_status', (x) => x.eq('userId', uid).eq('status', 'resolved')).collect(),
    ...await q('incidents').withIndex('by_user_status', (x) => x.eq('userId', uid).eq('status', 'cancelled')).collect(),
  ];
  for (const inc of incidentRows) {
    await del(await q('incidentLocations').withIndex('by_incident', (x) => x.eq('incidentId', inc._id)).collect());
    await ctx.db.delete(inc._id);
  }
  for (const row of await q('billingEvents').collect()) if (row.userId === uid) await ctx.db.delete(row._id);
  for (const row of await q('errorLogs').collect()) if (row.userId === uid) await ctx.db.delete(row._id);
  for (const row of await q('auditLogs').collect()) if (row.actorId === uid) await ctx.db.delete(row._id);
  for (const row of await q('recordingUploads').collect()) {
    if (row.userId !== uid) continue;
    if (row.storageId) { try { await ctx.storage.delete(row.storageId); } catch { /* */ } }
    await ctx.db.delete(row._id);
  }
  await del(await q('blocks').withIndex('by_blocked', (x) => x.eq('blockedId', uid)).collect());
  for (const row of await q('abuseReports').collect()) if (row.reportedId === uid) await ctx.db.delete(row._id);

  // Convex Auth-tabellen
  for (const s of await q('authSessions').withIndex('userId', (x) => x.eq('userId', uid)).collect()) {
    await del(await q('authRefreshTokens').withIndex('sessionId', (x) => x.eq('sessionId', s._id)).collect());
    await ctx.db.delete(s._id);
  }
  for (const acc of await q('authAccounts').withIndex('userIdAndProvider', (x) => x.eq('userId', uid)).collect()) {
    await del(await q('authVerificationCodes').withIndex('accountId', (x) => x.eq('accountId', acc._id)).collect());
    await ctx.db.delete(acc._id);
  }
  await ctx.db.delete(uid);
  await audit(ctx, undefined, 'account.deleted'); // geen PII
} });

/** Admin: misbruikmeldingen. Er bestaat bewust GEEN admin-query voor locaties. */
export const abuseReports = query({ args: {}, handler: async (ctx) => {
  const uid = await requireUser(ctx);
  if (!(await isAdmin(ctx, uid))) fail('FORBIDDEN');
  return await ctx.db.query('abuseReports').order('desc').take(100);
} });
