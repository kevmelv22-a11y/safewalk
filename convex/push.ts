import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_DELAY_MS = 15 * 60_000; // Expo adviseert receipts na ~15 min op te halen
const CRITICAL = new Set(['sos', 'missed_check_in', 'unsafe', 'wrong_pin', 'come_quick']);
const headers = () => ({ 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) });

export const load = internalQuery({ args: { ids: v.array(v.id('pushMessages')) }, handler: async (ctx, { ids }) => {
  const out = [];
  for (const id of ids) {
    const m = await ctx.db.get(id); if (!m) continue;
    const alert = m.alertId ? await ctx.db.get(m.alertId) : null;
    const tokens = (await ctx.db.query('pushTokens').withIndex('by_user', (q) => q.eq('userId', m.recipientId)).collect()).map((t) => t.token);
    out.push({ ...m, tokens, cancelled: alert?.status === 'cancelled' });
  }
  return out;
} });

const statusV = v.union(v.literal('sent'), v.literal('delivered'), v.literal('failed'), v.literal('no_token'), v.literal('unknown'));
export const update = internalMutation({
  args: { id: v.id('pushMessages'), status: statusV, detail: v.optional(v.string()), ticketIds: v.optional(v.array(v.string())), deadTokens: v.optional(v.array(v.string())), attempts: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const m = await ctx.db.get(a.id); if (!m) return;
    await ctx.db.patch(a.id, { status: a.status, detail: a.detail, ...(a.ticketIds ? { ticketIds: a.ticketIds } : {}), ...(a.attempts !== undefined ? { attempts: a.attempts } : {}) });
    for (const t of a.deadTokens ?? []) { const row = await ctx.db.query('pushTokens').withIndex('by_token', (q) => q.eq('token', t)).first(); if (row) await ctx.db.delete(row._id); }
    if (a.status === 'failed') await ctx.db.insert('errorLogs', { source: `push.${m.kind}`, message: (a.detail ?? 'onbekend').slice(0, 300) });
  },
});

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

/** Verstuurt naar Expo. 'sent' = ticket ok (aangenomen door Expo); pas een receipt bevestigt overdracht aan Apple/Google. */
export const deliver = internalAction({ args: { ids: v.array(v.id('pushMessages')), attempt: v.optional(v.number()) }, handler: async (ctx, { ids, attempt = 0 }) => {
  const msgs = await ctx.runQuery(internal.push.load, { ids });
  const sent: Id<'pushMessages'>[] = []; const retry: Id<'pushMessages'>[] = [];
  for (const m of msgs) {
    if (m.cancelled || (m.status !== 'queued' && m.status !== 'failed')) continue;
    if (m.tokens.length === 0) { await ctx.runMutation(internal.push.update, { id: m._id, status: 'no_token', detail: 'Geen pushtoken geregistreerd' }); continue; }
    try {
      const res = await fetch(SEND_URL, { method: 'POST', headers: headers(), body: JSON.stringify(m.tokens.map((to) => ({
        to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: CRITICAL.has(m.kind) ? 'high' : 'normal', channelId: CRITICAL.has(m.kind) ? 'safety-alerts' : 'default' }))) });
      const tickets: Ticket[] = ((await res.json().catch(() => ({}))) as { data?: Ticket[] }).data ?? [];
      const ok = tickets.filter((t) => t.status === 'ok' && t.id).map((t) => t.id!);
      const dead = m.tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
      if (res.ok && ok.length) { await ctx.runMutation(internal.push.update, { id: m._id, status: 'sent', ticketIds: ok, deadTokens: dead, attempts: attempt + 1 }); sent.push(m._id); }
      else {
        await ctx.runMutation(internal.push.update, { id: m._id, status: 'failed', detail: (tickets.find((t) => t.status !== 'ok')?.message ?? `HTTP ${res.status}`) + (process.env.EXPO_ACCESS_TOKEN ? '' : ' · tip: EXPO_ACCESS_TOKEN optioneel voor hogere Expo push quota'), deadTokens: dead, attempts: attempt + 1 });
        if (CRITICAL.has(m.kind)) retry.push(m._id);
      }
    } catch (e) {
      await ctx.runMutation(internal.push.update, { id: m._id, status: 'failed', detail: String(e).slice(0, 200), attempts: attempt + 1 });
      if (CRITICAL.has(m.kind)) retry.push(m._id);
    }
  }
  if (retry.length && attempt < 3) await ctx.scheduler.runAfter(30_000 * 2 ** attempt, internal.push.deliver, { ids: retry, attempt: attempt + 1 });
  if (sent.length) await ctx.scheduler.runAfter(RECEIPT_DELAY_MS, internal.push.checkReceipts, { ids: sent });
} });

/** Haalt Expo push receipts op. ok → 'delivered' (overgedragen aan Apple/Google, niet per se getoond); fout → 'failed'; geen receipt → 'unknown'. */
export const checkReceipts = internalAction({ args: { ids: v.array(v.id('pushMessages')), attempt: v.optional(v.number()) }, handler: async (ctx, { ids, attempt = 0 }) => {
  const msgs = (await ctx.runQuery(internal.push.load, { ids })).filter((m) => m.status === 'sent');
  const all = msgs.flatMap((m) => m.ticketIds);
  if (!all.length) return;
  let receipts: Record<string, Ticket> = {};
  try {
    const res = await fetch(RECEIPTS_URL, { method: 'POST', headers: headers(), body: JSON.stringify({ ids: all }) });
    receipts = (((await res.json().catch(() => ({}))) as { data?: Record<string, Ticket> }).data) ?? {};
  } catch { /* netwerkfout: later opnieuw */ }
  const pending: Id<'pushMessages'>[] = [];
  for (const m of msgs) {
    const rs = m.ticketIds.map((id) => receipts[id]).filter(Boolean);
    if (rs.some((r) => r.status === 'ok')) await ctx.runMutation(internal.push.update, { id: m._id, status: 'delivered' });
    else if (rs.length && rs.every((r) => r.status === 'error')) {
      const deadTokens = rs.some((r) => r.details?.error === 'DeviceNotRegistered') ? m.tokens : [];
      await ctx.runMutation(internal.push.update, { id: m._id, status: 'failed', detail: rs[0].message ?? rs[0].details?.error, deadTokens });
    } else if (attempt >= 3) await ctx.runMutation(internal.push.update, { id: m._id, status: 'unknown', detail: 'Geen ontvangstbevestiging van de pushdienst' });
    else pending.push(m._id);
  }
  if (pending.length) await ctx.scheduler.runAfter(30 * 60_000, internal.push.checkReceipts, { ids: pending, attempt: attempt + 1 });
} });
