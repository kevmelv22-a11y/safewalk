import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

export const alertPayload = internalQuery({ args: { alertId: v.id('alerts') }, handler: async (ctx, { alertId }) => {
  const a = await ctx.db.get(alertId); if (!a) return null;
  const name = (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', a.userId)).first())?.displayName || 'Je contact';
  const ds = await ctx.db.query('deliveries').withIndex('by_alert', (q) => q.eq('alertId', alertId)).collect();
  const recipients = await Promise.all(ds.filter((d) => d.status === 'queued' || d.status === 'failed').map(async (d) => ({
    recipientId: d.recipientId,
    tokens: (await ctx.db.query('pushTokens').withIndex('by_user', (q) => q.eq('userId', d.recipientId)).collect()).map((t) => t.token),
  })));
  return { alert: a, name, recipients };
} });

export const setDelivery = internalMutation({
  args: { alertId: v.id('alerts'), recipientId: v.id('users'), status: v.union(v.literal('sent'), v.literal('failed'), v.literal('no_token')), detail: v.optional(v.string()), deadTokens: v.array(v.string()) },
  handler: async (ctx, a) => {
    const d = (await ctx.db.query('deliveries').withIndex('by_alert', (q) => q.eq('alertId', a.alertId)).collect()).find((x) => x.recipientId === a.recipientId);
    if (d) await ctx.db.patch(d._id, { status: a.status, detail: a.detail });
    for (const t of a.deadTokens) { const row = await ctx.db.query('pushTokens').withIndex('by_token', (q) => q.eq('token', t)).first(); if (row) await ctx.db.delete(row._id); }
  },
});

export const mapsLink = (lat?: number, lng?: number) => (lat !== undefined && lng !== undefined ? `https://maps.google.com/?q=${lat},${lng}` : null);

export function message(kind: 'sos' | 'missed_check_in', name: string, link: string | null) {
  return kind === 'sos'
    ? { title: `🆘 SOS van ${name}`, body: link ? `${name} heeft SOS geactiveerd. Laatst bekende locatie: ${link}` : `${name} heeft SOS geactiveerd. Geen recente locatie beschikbaar.` }
    : { title: `⚠️ ${name} heeft niet ingecheckt`, body: `${name} heeft niet op tijd bevestigd veilig te zijn. ${link ? `Laatst bekende locatie: ${link}` : 'Geen recente locatie.'} Probeer contact op te nemen.` };
}

/**
 * Verstuurt Expo push per ontvanger en legt status vast. 'sent' = geaccepteerd door de Expo-pushdienst,
 * NIET gegarandeerd afgeleverd. Mislukte leveringen worden tot 3× opnieuw geprobeerd.
 */
export const sendAlert = internalAction({ args: { alertId: v.id('alerts'), attempt: v.optional(v.number()) }, handler: async (ctx, { alertId, attempt = 0 }) => {
  const p = await ctx.runQuery(internal.push.alertPayload, { alertId });
  if (!p || p.alert.status === 'cancelled') return;
  const msg = message(p.alert.kind, p.name, mapsLink(p.alert.lat, p.alert.lng));
  let anyFailed = false;
  for (const r of p.recipients) {
    if (r.tokens.length === 0) { await ctx.runMutation(internal.push.setDelivery, { alertId, recipientId: r.recipientId, status: 'no_token', detail: 'Geen pushtoken geregistreerd', deadTokens: [] }); continue; }
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
        body: JSON.stringify(r.tokens.map((to) => ({ to, ...msg, sound: 'default', priority: 'high', channelId: 'safety-alerts', data: { type: p.alert.kind, alertId, sessionId: p.alert.sessionId } }))),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { status: string; message?: string; details?: { error?: string } }[] };
      const tickets = body.data ?? [];
      const ok = res.ok && tickets.some((t) => t.status === 'ok');
      const deadTokens = r.tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
      if (!ok) anyFailed = true;
      await ctx.runMutation(internal.push.setDelivery, { alertId, recipientId: r.recipientId, status: ok ? 'sent' : 'failed',
        detail: ok ? undefined : (tickets.find((t) => t.status !== 'ok')?.message ?? `HTTP ${res.status}`), deadTokens });
    } catch (e) {
      anyFailed = true;
      await ctx.runMutation(internal.push.setDelivery, { alertId, recipientId: r.recipientId, status: 'failed', detail: String(e).slice(0, 200), deadTokens: [] });
    }
  }
  if (anyFailed && attempt < 3) await ctx.scheduler.runAfter(30_000 * 2 ** attempt, internal.push.sendAlert, { alertId, attempt: attempt + 1 });
} });
