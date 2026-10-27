import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';

type Kind = Doc<'pushMessages'>['kind'];
/** Zet pushberichten per ontvanger in de wachtrij en plant verzending (Expo) direct in. */
export async function queuePush(ctx: MutationCtx, m: { kind: Kind; recipients: Id<'users'>[]; title: string; body: string; data?: Record<string, unknown>; alertId?: Id<'alerts'>; sessionId?: Id<'sessions'> }) {
  const ids: Id<'pushMessages'>[] = [];
  for (const r of new Set(m.recipients)) ids.push(await ctx.db.insert('pushMessages', {
    recipientId: r, kind: m.kind, alertId: m.alertId, sessionId: m.sessionId, title: m.title, body: m.body,
    data: { type: m.kind, alertId: m.alertId, sessionId: m.sessionId, ...m.data }, status: 'queued', ticketIds: [], attempts: 0,
  }));
  if (ids.length) await ctx.scheduler.runAfter(0, internal.push.deliver, { ids });
  return ids;
}
export const mapsLink = (lat?: number, lng?: number) => (lat !== undefined && lng !== undefined ? `https://maps.google.com/?q=${lat},${lng}` : null);
