// E-mailmeldingen voor kijkers zonder app (via de meekijklink): dubbele opt-in, afmelden, limieten.
// Versturen via Resend (gratis tier). Zonder RESEND_API_KEY wordt er nooit succes geveinsd.
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { randomToken, rateLimit, sha256Hex } from './lib';
import { grantOk, isHex64, linkByToken, linkUsable } from './linkAccess';
import {
  CONFIRM_TTL_MS, DAILY_VIEWER_EMAIL_CAP, MAX_EMAILS_PER_SUBSCRIPTION, MAX_SUBSCRIBERS_PER_LINK,
  confirmEmail, isEmail, viewerEmail, type EventDetails, type ViewerEvent,
} from './liveShare';

const eventVal = v.union(v.literal('sos'), v.literal('sos_cancelled'), v.literal('missed'), v.literal('arrived'),
  v.literal('ended'), v.literal('low_battery'), v.literal('not_live'));
const detailsVal = v.object({
  what: v.string(), at: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()),
  locationAt: v.optional(v.number()), batteryPct: v.optional(v.number()),
});

const site = () => (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');

/**
 * Plaatst per actieve e-mailabonnee van de links van deze reis één melding in de wachtrij.
 * Ontdubbeld per gebeurtenis (dedupeKey), max. MAX_EMAILS_PER_SUBSCRIPTION per abonnee.
 * Na 'arrived'/'ended' stopt het abonnement (en wordt het adres bij de volgende opruimronde gewist).
 */
export async function notifyLinkViewers(ctx: MutationCtx, sessionId: Id<'sessions'>, ev: ViewerEvent, details: EventDetails, dedupeKey: string = ev, onlyIfSent?: string) {
  const now = Date.now();
  const subs = await ctx.db.query('viewerSubscriptions').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect();
  let queued = 0;
  for (const s of subs) {
    if (s.status !== 'active') continue;
    if (s.sent.includes(dedupeKey) || s.sent.length >= MAX_EMAILS_PER_SUBSCRIPTION) continue;
    if (onlyIfSent && !s.sent.includes(onlyIfSent)) continue;
    if (!linkUsable(await ctx.db.get(s.linkId), now)) continue;
    const done = ev === 'arrived' || ev === 'ended';
    await ctx.db.patch(s._id, { sent: [...s.sent, dedupeKey], ...(done ? { status: 'ended' as const } : {}) });
    await ctx.scheduler.runAfter(0, internal.viewerAlerts.deliver, { subscriptionId: s._id, ev, details });
    queued++;
  }
  return queued;
}

export type SubscribeStatus = 'pending' | 'already' | 'invalid' | 'locked' | 'bad_email' | 'no_consent' | 'full' | 'no_trip' | 'rate_limited';

/** Aanmelden via de meekijkpagina (alleen voor links van een reis). Altijd een status, geen stille successen. */
export const subscribe = internalMutation({
  args: { token: v.string(), grant: v.optional(v.string()), email: v.string(), consent: v.boolean() },
  handler: async (ctx, a): Promise<{ ok: boolean; status: SubscribeStatus }> => {
    const now = Date.now();
    const link = await linkByToken(ctx, a.token, now);
    if (!link) return { ok: false, status: 'invalid' };
    if (!(await grantOk(ctx, link, a.grant, now))) return { ok: false, status: 'locked' };
    if (!link.sessionId) return { ok: false, status: 'no_trip' };
    const session = await ctx.db.get(link.sessionId);
    if (!session || session.endedAt !== undefined || session.userId !== link.userId) return { ok: false, status: 'no_trip' };
    if (!a.consent) return { ok: false, status: 'no_consent' };
    const email = a.email.trim().toLowerCase();
    if (!isEmail(email)) return { ok: false, status: 'bad_email' };
    const emailHash = await sha256Hex(`viewer-email|${email}`);
    try {
      await rateLimit(ctx, `vsub-link:${link._id}`, 10, 3600_000);
      await rateLimit(ctx, `vsub-mail:${emailHash}`, 5, 24 * 3600_000);
    } catch (e) {
      if (e instanceof ConvexError && e.data === 'RATE_LIMITED') return { ok: false, status: 'rate_limited' };
      throw e;
    }
    const subs = await ctx.db.query('viewerSubscriptions').withIndex('by_link', (q) => q.eq('linkId', link._id)).collect();
    const live = subs.filter((s) => s.status === 'active' || (s.status === 'pending' && s.createdAt > now - CONFIRM_TTL_MS));
    const same = live.find((s) => s.emailHash === emailHash);
    if (same?.status === 'active') return { ok: true, status: 'already' };
    if (!same && live.length >= MAX_SUBSCRIBERS_PER_LINK) return { ok: false, status: 'full' };
    const confirmToken = randomToken();
    const confirmHash = await sha256Hex(confirmToken);
    let id: Id<'viewerSubscriptions'>;
    if (same) { id = same._id; await ctx.db.patch(same._id, { confirmHash, createdAt: now, lastError: undefined }); }
    else id = await ctx.db.insert('viewerSubscriptions', {
      linkId: link._id, ownerId: link.userId, sessionId: link.sessionId, email, emailHash, status: 'pending',
      confirmHash, unsubToken: randomToken(), createdAt: now, expiresAt: link.expiresAt, sent: [],
    });
    await ctx.scheduler.runAfter(0, internal.viewerAlerts.deliverConfirm, { subscriptionId: id, confirmToken });
    return { ok: true, status: 'pending' };
  },
});

/** Bevestigen (via POST vanaf de bevestigingspagina, niet via GET: linkscanners in mailboxen klikken anders mee). */
export const confirm = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!isHex64(token)) return false;
    const now = Date.now();
    const hashed = await sha256Hex(token);
    const s = await ctx.db.query('viewerSubscriptions').withIndex('by_confirm', (q) => q.eq('confirmHash', hashed)).first();
    if (!s) return false;
    if (s.status === 'active') return true;
    if (s.status !== 'pending' || s.createdAt < now - CONFIRM_TTL_MS) return false;
    if (!linkUsable(await ctx.db.get(s.linkId), now)) return false;
    await ctx.db.patch(s._id, { status: 'active', confirmedAt: now });
    return true;
  },
});

export const unsubscribe = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!isHex64(token)) return false;
    const s = await ctx.db.query('viewerSubscriptions').withIndex('by_unsub', (q) => q.eq('unsubToken', token)).first();
    if (!s) return false;
    if (s.status === 'pending' || s.status === 'active') await ctx.db.patch(s._id, { status: 'unsubscribed' });
    return true;
  },
});

export const getForSend = internalQuery({
  args: { subscriptionId: v.id('viewerSubscriptions') },
  handler: async (ctx, { subscriptionId }) => {
    const s = await ctx.db.get(subscriptionId);
    if (!s) return null;
    const link = await ctx.db.get(s.linkId);
    return { email: s.email, unsubToken: s.unsubToken, status: s.status, linkOk: linkUsable(link) };
  },
});

/** Globale dagelijkse limiet (Resend gratis tier). false = limiet bereikt, niet versturen. */
export const reserveEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    try { await rateLimit(ctx, 'viewer-email-day', DAILY_VIEWER_EMAIL_CAP, 24 * 3600_000); return true; }
    catch (e) { if (e instanceof ConvexError && e.data === 'RATE_LIMITED') return false; throw e; }
  },
});

export const recordResult = internalMutation({
  args: { subscriptionId: v.id('viewerSubscriptions'), error: v.optional(v.string()) },
  handler: async (ctx, { subscriptionId, error }) => {
    const s = await ctx.db.get(subscriptionId);
    if (s) await ctx.db.patch(subscriptionId, { lastError: error });
    if (error) await ctx.db.insert('errorLogs', { source: 'viewer-email', message: error });
  },
});

export type SendResult = { delivered: boolean; devLogged: boolean; error?: string };

/** Eén e-mail via Resend. Geen sleutel: alleen met AUTH_EMAIL_DEV_LOG=true een log zónder adres, anders een fout. */
export async function sendEmail(
  m: { to: string; subject: string; text: string; html: string; unsubUrl?: string },
  env: Record<string, string | undefined> = process.env,
): Promise<SendResult> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.AUTH_EMAIL_DEV_LOG === 'true') { console.log(`[viewer-email DEV] "${m.subject}" (adres niet gelogd)`); return { delivered: false, devLogged: true }; }
    return { delivered: false, devLogged: false, error: 'EMAIL_NOT_CONFIGURED' };
  }
  const headers: Record<string, string> = {};
  if (m.unsubUrl) { headers['List-Unsubscribe'] = `<${m.unsubUrl}>`; headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM ?? 'SafeWalk <onboarding@resend.dev>', to: [m.to], subject: m.subject, text: m.text, html: m.html, headers }),
    });
    if (!res.ok) return { delivered: false, devLogged: false, error: `RESEND_${res.status}` };
    return { delivered: true, devLogged: false };
  } catch { return { delivered: false, devLogged: false, error: 'RESEND_NETWORK' }; }
}

export const deliver = internalAction({
  args: { subscriptionId: v.id('viewerSubscriptions'), ev: eventVal, details: detailsVal },
  handler: async (ctx, a) => {
    const s = await ctx.runQuery(internal.viewerAlerts.getForSend, { subscriptionId: a.subscriptionId });
    // 'ended' is de status ná een laatste melding (aankomst/gestopt); die laatste melding gaat nog wel uit.
    if (!s || !s.linkOk || (s.status !== 'active' && s.status !== 'ended')) return { skipped: true };
    if (!(await ctx.runMutation(internal.viewerAlerts.reserveEmail, {}))) {
      await ctx.runMutation(internal.viewerAlerts.recordResult, { subscriptionId: a.subscriptionId, error: 'DAILY_CAP' });
      return { skipped: true };
    }
    const unsubUrl = `${site()}/track/email-stop?t=${s.unsubToken}`;
    const msg = viewerEmail(a.ev as ViewerEvent, a.details, unsubUrl);
    const r = await sendEmail({ to: s.email, ...msg, unsubUrl });
    await ctx.runMutation(internal.viewerAlerts.recordResult, { subscriptionId: a.subscriptionId, error: r.error });
    return r;
  },
});

export const deliverConfirm = internalAction({
  args: { subscriptionId: v.id('viewerSubscriptions'), confirmToken: v.string() },
  handler: async (ctx, a) => {
    const s = await ctx.runQuery(internal.viewerAlerts.getForSend, { subscriptionId: a.subscriptionId });
    if (!s || !s.linkOk || s.status !== 'pending') return { skipped: true };
    if (!(await ctx.runMutation(internal.viewerAlerts.reserveEmail, {}))) {
      await ctx.runMutation(internal.viewerAlerts.recordResult, { subscriptionId: a.subscriptionId, error: 'DAILY_CAP' });
      return { skipped: true };
    }
    const msg = confirmEmail(`${site()}/track/email-confirm?t=${a.confirmToken}`);
    const r = await sendEmail({ to: s.email, ...msg });
    await ctx.runMutation(internal.viewerAlerts.recordResult, { subscriptionId: a.subscriptionId, error: r.error });
    return r;
  },
});

/** Opruimen: adressen weg zodra de link verlopen/ingetrokken is, na afmelden/einde, of onbevestigd na 24 u. */
export async function purgeViewerData(ctx: MutationCtx, now = Date.now()) {
  let n = 0;
  for (const s of await ctx.db.query('viewerSubscriptions').collect()) {
    const link = await ctx.db.get(s.linkId);
    const gone = !linkUsable(link, now) || s.status === 'unsubscribed' || s.status === 'ended'
      || (s.status === 'pending' && s.createdAt < now - CONFIRM_TTL_MS);
    if (gone) { await ctx.db.delete(s._id); n++; }
  }
  for (const g of await ctx.db.query('linkGrants').collect()) {
    if (g.expiresAt <= now || !linkUsable(await ctx.db.get(g.linkId), now)) { await ctx.db.delete(g._id); n++; }
  }
  return n;
}

/** Bij intrekken van een link: kijkerssleutels en e-mailadressen meteen weg. */
export async function deleteLinkViewerData(ctx: MutationCtx, linkId: Id<'shareLinks'>) {
  for (const s of await ctx.db.query('viewerSubscriptions').withIndex('by_link', (q) => q.eq('linkId', linkId)).collect()) await ctx.db.delete(s._id);
  for (const g of await ctx.db.query('linkGrants').withIndex('by_link', (q) => q.eq('linkId', linkId)).collect()) await ctx.db.delete(g._id);
}
