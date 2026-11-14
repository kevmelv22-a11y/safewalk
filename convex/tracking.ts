import { httpAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { audit, fail, randomToken, rateLimit, requireAdult, requireUser, sessionOpen, sha256Hex } from './lib';
import { downloadUrl, liveTrackHtml, tripState, type PublicTrip } from './trackPage';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { grantOk, hashAccessCode, linkByToken, newAccessCode, newSalt, timingSafeEqualHex } from './linkAccess';
import { CODE_ATTEMPTS_PER_WINDOW, CODE_MAX_FAILURES, CODE_WINDOW_MS, linkExpiry, normalizeAccessCode, revealDetails, thinTrail, type LinkDuration } from './liveShare';
import { deleteLinkViewerData } from './viewerAlerts';

const durationVal = v.union(v.literal('15m'), v.literal('1h'), v.literal('arrival'), v.literal('8h'));
const TRAIL_WINDOW_MS = 60 * 60_000;

/** Optionele toegangscode: genereert 6 cijfers, bewaart alleen PBKDF2-hash + salt. De code gaat één keer terug naar de app. */
async function codeFields(withCode: boolean | undefined) {
  if (!withCode) return { fields: {}, accessCode: null as string | null };
  const accessCode = newAccessCode();
  const codeSalt = newSalt();
  return { fields: { codeSalt, codeHash: await hashAccessCode(accessCode, codeSalt) }, accessCode };
}

/** Maakt een meekijklink voor een (open) reis. Gedeeld door de reis-knop en het starten van een reis met alleen een link. */
export async function insertTripLink(ctx: MutationCtx, uid: Id<'users'>, s: Doc<'sessions'>, o: { duration?: LinkDuration; withCode?: boolean }) {
  const now = Date.now();
  const duration = o.duration ?? 'arrival';
  const expiresAt = linkExpiry(duration, now, s.expiresAt);
  const token = randomToken();
  const { fields, accessCode } = await codeFields(o.withCode);
  const id = await ctx.db.insert('shareLinks', {
    userId: uid, tokenHash: await sha256Hex(token), sessionId: s._id,
    label: 'Meekijklink reis', scopes: ['location'], locationConsent: true, expiresAt, createdAt: now, duration, ...fields,
  });
  await audit(ctx, uid, 'share.create_trip', id, { ttl: expiresAt - now, duration, code: !!accessCode });
  return { id, token, expiresAt, path: `/track/live?token=${token}`, accessCode, duration };
}

const DEFAULT_TTL_MS = 2 * 60 * 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;
const FRESH_MS = 2 * 60_000;

const scopeVal = v.union(v.literal('location'), v.literal('recording'));

function securityHeaders(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extra,
  };
}

/** Maak intrekbaar/verlopend share-link. Token alleen één keer terug; DB bewaart hash. */
export const createShareLink = mutation({
  args: {
    sessionId: v.optional(v.id('sessions')),
    incidentId: v.optional(v.id('incidents')),
    label: v.optional(v.string()),
    ttlMs: v.optional(v.number()),
    scopes: v.optional(v.array(scopeVal)),
    locationConsent: v.boolean(),
    duration: v.optional(durationVal),
    withCode: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    await rateLimit(ctx, `share-create:${uid}`, 20, 60 * 60_000);
    let session: Doc<'sessions'> | null = null;
    if (a.sessionId) {
      session = await ctx.db.get(a.sessionId);
      if (!session || session.userId !== uid) fail('FORBIDDEN');
    }
    if (a.incidentId) {
      const i = await ctx.db.get(a.incidentId);
      if (!i || i.userId !== uid) fail('FORBIDDEN');
    }
    const scopes = (a.scopes?.length ? [...new Set(a.scopes)] : ['location']) as ('location' | 'recording')[];
    if (scopes.includes('location') && !a.locationConsent) fail('LOCATION_CONSENT_REQUIRED');
    if (!scopes.includes('location') && !scopes.includes('recording')) fail('BAD_REQUEST');
    const now = Date.now();
    const expiresAt = a.duration
      ? linkExpiry(a.duration, now, session && sessionOpen(session, now) ? session.expiresAt : undefined)
      : now + Math.min(Math.max(a.ttlMs ?? DEFAULT_TTL_MS, 5 * 60_000), MAX_TTL_MS);
    const ttl = expiresAt - now;
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const { fields, accessCode } = await codeFields(a.withCode);
    const id = await ctx.db.insert('shareLinks', {
      userId: uid, tokenHash, sessionId: a.sessionId, incidentId: a.incidentId,
      label: a.label?.slice(0, 80), scopes, locationConsent: a.locationConsent,
      expiresAt, createdAt: now, ...(a.duration ? { duration: a.duration } : {}), ...fields,
    });
    // Audit zonder raw token of code (geen credential in logs)
    await audit(ctx, uid, 'share.create', id, { ttl, scopes, hasIncident: !!a.incidentId, code: !!accessCode });
    return { id, token, expiresAt, path: `/track/live?token=${token}`, scopes, accessCode };
  },
});

/**
 * Meekijklink voor de lopende reis (voor iemand zonder app). Geldig tot de reis verloopt, max. 24 uur.
 * Locatie alleen zolang de reis actief is; daarna toont de link alleen nog "aangekomen" of "gestopt".
 */
export const createTripLink = mutation({
  args: { sessionId: v.id('sessions'), locationConsent: v.boolean(), duration: v.optional(durationVal), withCode: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await requireAdult(ctx, uid);
    if (!a.locationConsent) fail('LOCATION_CONSENT_REQUIRED');
    await rateLimit(ctx, `share-create:${uid}`, 20, 60 * 60_000);
    const s = await ctx.db.get(a.sessionId);
    if (!s || s.userId !== uid) fail('FORBIDDEN');
    if (!sessionOpen(s!)) fail('SESSION_CLOSED');
    return await insertTripLink(ctx, uid, s!, { duration: a.duration, withCode: a.withCode });
  },
});

export const revokeShareLink = mutation({
  args: { id: v.id('shareLinks') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== uid) fail('NOT_FOUND');
    await ctx.db.patch(id, { revokedAt: Date.now() });
    // Kijkerssleutels en e-mailadressen van kijkers meteen weg.
    await deleteLinkViewerData(ctx, id);
    await audit(ctx, uid, 'share.revoke', id);
  },
});

/** Intern: trek alle links voor incidenten/sessie in (einde incident). */
export const revokeForIncidents = internalMutation({
  args: { userId: v.id('users'), incidentIds: v.array(v.id('incidents')) },
  handler: async (ctx, { userId, incidentIds }) => {
    const now = Date.now();
    const set = new Set(incidentIds.map(String));
    const rows = await ctx.db.query('shareLinks').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    let n = 0;
    for (const r of rows) {
      if (r.revokedAt) continue;
      if (r.incidentId && set.has(String(r.incidentId))) {
        await ctx.db.patch(r._id, { revokedAt: now });
        n++;
      }
    }
    return { revoked: n };
  },
});

export const myShareLinks = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const rows = await ctx.db.query('shareLinks').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    const now = Date.now();
    const out = [];
    for (const r of rows) {
      if (r.revokedAt) continue;
      const subs = await ctx.db.query('viewerSubscriptions').withIndex('by_link', (q) => q.eq('linkId', r._id)).collect();
      out.push({
        id: r._id, label: r.label ?? null, expiresAt: r.expiresAt, expired: r.expiresAt < now,
        sessionId: r.sessionId ?? null, incidentId: r.incidentId ?? null, createdAt: r.createdAt,
        scopes: r.scopes, locationConsent: r.locationConsent,
        duration: r.duration ?? null, hasCode: !!r.codeHash, codeLocked: r.codeLockedAt !== undefined,
        // Alleen een aantal; de eigenaar ziet geen e-mailadressen van kijkers.
        emailSubscribers: subs.filter((x) => x.status === 'active').length,
      });
    }
    return out;
  },
});

/**
 * Toegangscode controleren. Geeft altijd een resultaat terug (geen throw), zodat foute pogingen meetellen.
 * Max. CODE_ATTEMPTS_PER_WINDOW foute pogingen per kwartier; na CODE_MAX_FAILURES in totaal is de link op slot.
 */
export const unlockLink = internalMutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, a): Promise<{ ok: true; grant: string } | { ok: false; reason: 'invalid' | 'wrong' | 'rate_limited' | 'locked' | 'no_code' }> => {
    const now = Date.now();
    const link = await linkByToken(ctx, a.token, now);
    if (!link) return { ok: false, reason: 'invalid' };
    if (!link.codeHash || !link.codeSalt) return { ok: false, reason: 'no_code' };
    if (link.codeLockedAt !== undefined) return { ok: false, reason: 'locked' };
    const key = `link-code:${link._id}`;
    const rl = await ctx.db.query('rateLimits').withIndex('by_key', (q) => q.eq('key', key)).first();
    const inWindow = rl && rl.windowStart >= now - CODE_WINDOW_MS ? rl.hits : 0;
    if (inWindow >= CODE_ATTEMPTS_PER_WINDOW) return { ok: false, reason: 'rate_limited' };
    const code = normalizeAccessCode(a.code);
    const good = code !== null && timingSafeEqualHex(await hashAccessCode(code, link.codeSalt), link.codeHash);
    if (!good) {
      if (!rl) await ctx.db.insert('rateLimits', { key, windowStart: now, hits: 1 });
      else if (rl.windowStart < now - CODE_WINDOW_MS) await ctx.db.patch(rl._id, { windowStart: now, hits: 1 });
      else await ctx.db.patch(rl._id, { hits: rl.hits + 1 });
      const failures = (link.codeFailures ?? 0) + 1;
      await ctx.db.patch(link._id, { codeFailures: failures, ...(failures >= CODE_MAX_FAILURES ? { codeLockedAt: now } : {}) });
      if (failures >= CODE_MAX_FAILURES) {
        await deleteLinkViewerData(ctx, link._id);
        await audit(ctx, undefined, 'share.code_locked', link._id);
        return { ok: false, reason: 'locked' };
      }
      return { ok: false, reason: 'wrong' };
    }
    const grant = randomToken();
    await ctx.db.insert('linkGrants', { linkId: link._id, grantHash: await sha256Hex(grant), expiresAt: link.expiresAt });
    return { ok: true, grant };
  },
});

/** Bij verlengen van een reis: links "tot aankomst" schuiven mee (nooit langer dan 24 u na aanmaken). */
export async function extendArrivalLinks(ctx: MutationCtx, sessionId: Id<'sessions'>, sessionExpiresAt: number) {
  for (const l of await ctx.db.query('shareLinks').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()) {
    if (l.revokedAt || l.duration !== 'arrival') continue;
    const exp = Math.min(sessionExpiresAt, l.createdAt + MAX_TTL_MS);
    if (exp > l.expiresAt) {
      await ctx.db.patch(l._id, { expiresAt: exp });
      for (const g of await ctx.db.query('linkGrants').withIndex('by_link', (q) => q.eq('linkId', l._id)).collect()) await ctx.db.patch(g._id, { expiresAt: exp });
    }
  }
}

/**
 * Publieke resolutie: elke request checkt expiry/revoke.
 * `live` alleen true als er een actieve updater (incident of open sessie) + verse locatie is.
 */
export const resolvePublic = internalQuery({
  args: { token: v.string(), grant: v.optional(v.string()) },
  handler: async (ctx, { token, grant }) => {
    const now = Date.now();
    const row = await linkByToken(ctx, token, now);
    if (!row) return null;
    const scopes = row.scopes ?? ['location'];
    // Link met toegangscode: zonder geldige kijkerssleutel alleen "op slot" (geen status, locatie of bestemming).
    if (!(await grantOk(ctx, row, grant, now))) {
      return {
        locked: true, codeLocked: row.codeLockedAt !== undefined, expiresAt: row.expiresAt, serverNow: now,
        label: null, scopes, location: null, trail: [] as [number, number][], live: false, updaterActive: false, updater: null,
        freshnessMs: null, recordings: [] as { id: string; createdAt: number; byteSize: number }[], trip: null, canSubscribe: false, hasCode: true,
      };
    }

    let updaterActive = false;
    let updater: 'incident' | 'session' | null = null;
    // Meekijklink voor een reis: bestemming, verwachte aankomst en check-in-status (geen naam).
    let trip: PublicTrip | null = null;
    let sessionLive = false;
    let reveal = true;
    let session: Doc<'sessions'> | null = null;
    if (row.incidentId) {
      const inc = await ctx.db.get(row.incidentId);
      if (inc && inc.status === 'active' && inc.userId === row.userId) {
        updaterActive = true;
        updater = 'incident';
      }
    }
    if (row.sessionId) {
      const s = await ctx.db.get(row.sessionId);
      if (s && s.userId === row.userId && s.endedAt === undefined && (s.status === 'active' || s.status === 'alert')) {
        updaterActive = true;
        if (!updater) updater = 'session';
      }
      if (s && s.userId === row.userId) {
        session = s;
        sessionLive = sessionOpen(s, now);
        const checkIns = await ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', s._id)).collect();
        const ci = checkIns.filter((c) => c.status !== 'cancelled').pop() ?? checkIns.at(-1) ?? null;
        const st = tripState(s, ci, now);
        reveal = revealDetails(s, ci?.status ?? null);
        const showDevice = sessionLive && reveal;
        trip = {
          destination: s.destinationLabel, expectedArrival: s.expectedArrival, state: st.state, graceEndsAt: st.graceEndsAt,
          endedAt: s.endedAt ?? null,
          // Toestelstatus alleen zolang de reis loopt (wordt bij einde reis ook op de server gewist) en niet verborgen door privacymodus.
          batteryPct: showDevice ? s.batteryPct ?? null : null, lastSeenAt: showDevice ? s.lastSeenAt ?? null : null,
          kind: s.kind ?? 'trip',
          privacyMode: !!s.privacyMode,
          revealed: !!s.privacyMode && reveal,
          // Bestemmingspunt (geen route-advies). In privacymodus pas bij gemiste check-in of SOS.
          destinationPoint: reveal && s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng } : null,
          // Telefoon geeft nog iets door (ook in privacymodus, zonder tijdstip of plek).
          deviceLive: sessionLive && s.lastSeenAt !== undefined && now - s.lastSeenAt <= FRESH_MS,
          signals: {
            sosAt: sessionLive ? s.sosAt ?? null : null,
            lowBattery: showDevice && s.lowBatteryAt !== undefined,
            notLiveSince: sessionLive && s.notLiveAt !== undefined ? s.lastSeenAt ?? s.notLiveAt : null,
          },
        };
      }
    }

    let location: null | {
      lat: number; lng: number; accuracyM: number | null; recordedAt: number;
      stale: boolean; source: string;
    } = null;
    let trail: [number, number][] = [];

    if (scopes.includes('location') && row.locationConsent) {
      if (row.incidentId) {
        const locs = await ctx.db.query('incidentLocations')
          .withIndex('by_incident', (q) => q.eq('incidentId', row.incidentId!)).order('desc').take(1);
        if (locs[0]) {
          const age = now - locs[0].recordedAt;
          location = {
            lat: locs[0].lat, lng: locs[0].lng, accuracyM: locs[0].accuracyM ?? null,
            recordedAt: locs[0].recordedAt, stale: age > FRESH_MS, source: 'incident',
          };
        }
      }
      // Reislocatie alleen zolang de reis actief is (en in privacymodus pas na gemiste check-in of SOS).
      if (!location && row.sessionId && sessionLive && reveal && session) {
        const locs = await ctx.db.query('locations')
          .withIndex('by_session', (q) => q.eq('sessionId', row.sessionId!).gte('recordedAt', now - TRAIL_WINDOW_MS)).order('desc').take(240);
        const latest = locs[0] ?? (await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', row.sessionId!)).order('desc').first());
        if (latest) {
          const age = now - latest.recordedAt;
          location = {
            lat: latest.lat, lng: latest.lng, accuracyM: latest.accuracyM ?? null,
            recordedAt: latest.recordedAt, stale: age > FRESH_MS, source: 'session',
          };
        }
        // Recente route (laatste uur, uitgedund). Alleen punten met redelijke nauwkeurigheid.
        trail = thinTrail(locs.slice().reverse().filter((l) => (l.accuracyM ?? 0) <= 150).map((l) => [l.lat, l.lng] as [number, number]), 120);
      }
      // Fallback: alert snapshot (éénmalig, niet “live”)
      if (!location && row.incidentId) {
        const inc = await ctx.db.get(row.incidentId);
        if (inc?.alertId) {
          const al = await ctx.db.get(inc.alertId);
          if (al?.lat !== undefined && al?.lng !== undefined) {
            const recordedAt = al.locationAt ?? al._creationTime;
            location = {
              lat: al.lat, lng: al.lng, accuracyM: al.accuracyM ?? null,
              recordedAt, stale: now - recordedAt > FRESH_MS, source: 'alert_snapshot',
            };
          }
        }
      }
    }

    const live = !!(updaterActive && location && !location.stale && location.source !== 'alert_snapshot');

    let recordings: { id: string; createdAt: number; byteSize: number }[] = [];
    if (scopes.includes('recording') && row.incidentId) {
      const recs = await ctx.db.query('recordings')
        .withIndex('by_incident', (q) => q.eq('incidentId', row.incidentId!)).collect();
      recordings = recs.filter((r) => !r.deletedAt && r.userId === row.userId)
        .map((r) => ({ id: r._id, createdAt: r.createdAt, byteSize: r.byteSize }));
    }

    return {
      locked: false,
      codeLocked: false,
      expiresAt: row.expiresAt,
      label: row.label ?? null,
      scopes,
      location,
      trail,
      live,
      updaterActive,
      updater,
      freshnessMs: location ? now - location.recordedAt : null,
      recordings,
      trip,
      // E-mailmeldingen kunnen alleen bij een lopende reis.
      canSubscribe: !!row.sessionId && sessionLive,
      hasCode: !!row.codeHash,
      serverNow: now,
    };
  },
});

/** Tijdelijke download-URL via share-token + recording scope; elke request her-checkt revoke/expiry. */
export const resolveRecordingDownload = internalQuery({
  args: { token: v.string(), recordingId: v.id('recordings') },
  handler: async (ctx, { token, recordingId }) => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const link = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
    if (!link || link.revokedAt || link.expiresAt < Date.now()) return null;
    if (!(link.scopes ?? []).includes('recording')) return null;
    const row = await ctx.db.get(recordingId);
    if (!row || row.deletedAt || row.userId !== link.userId) return null;
    if (!link.incidentId || row.incidentId !== link.incidentId) return null;
    return { storageId: row.storageId, mime: row.mime, byteSize: row.byteSize };
  },
});

export const publicLocation = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const grant = req.headers.get('x-safewalk-grant') ?? undefined;
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token, grant });
  const h = securityHeaders({ 'Content-Type': 'application/json' });
  if (!data) {
    return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 404, headers: h });
  }
  if (data.locked) {
    return new Response(JSON.stringify({ ok: true, locked: true, codeLocked: data.codeLocked, expiresAt: data.expiresAt, serverNow: data.serverNow }), { status: 200, headers: h });
  }
  return new Response(JSON.stringify({
    ok: true,
    locked: false,
    expiresAt: data.expiresAt,
    label: data.label,
    scopes: data.scopes,
    live: data.live,
    updaterActive: data.updaterActive,
    updater: data.updater,
    freshnessMs: data.freshnessMs,
    location: data.location,
    trail: data.trail,
    recordings: data.scopes.includes('recording') ? data.recordings : [],
    trip: data.trip,
    canSubscribe: data.canSubscribe,
    serverNow: data.serverNow,
    note: data.live
      ? 'Live locatie (updater actief, vers). SafeWalk is geen 112-hulpdienst.'
      : 'Geen live-claim: geen actieve updater of locatie verouderd/ontbreekt. SafeWalk is geen 112-hulpdienst.',
  }), { status: 200, headers: h });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: securityHeaders({ 'Content-Type': 'application/json' }) });
async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > 4096) return null;
  try { const t = await req.text(); if (t.length > 4096) return null; const j = JSON.parse(t); return j && typeof j === 'object' ? j : null; }
  catch { return null; }
}

/** POST /track/unlock {token, code} → kijkerssleutel (alleen voor links met toegangscode). */
export const publicUnlock = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if (!body || typeof body.token !== 'string' || typeof body.code !== 'string') return json({ ok: false, reason: 'bad_request' }, 400);
  const r = await ctx.runMutation(internal.tracking.unlockLink, { token: body.token, code: body.code.slice(0, 16) });
  return json(r, r.ok ? 200 : r.reason === 'invalid' ? 404 : r.reason === 'rate_limited' ? 429 : 403);
});

/** POST /track/subscribe {token, email, consent} (+ x-safewalk-grant) → bevestigingsmail (dubbele opt-in). */
export const publicSubscribe = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if (!body || typeof body.token !== 'string' || typeof body.email !== 'string') return json({ ok: false, status: 'bad_request' }, 400);
  const grant = req.headers.get('x-safewalk-grant') ?? undefined;
  const r = await ctx.runMutation(internal.viewerAlerts.subscribe, { token: body.token, grant, email: body.email.slice(0, 254), consent: body.consent === true });
  return json(r, r.ok ? 200 : r.status === 'invalid' ? 404 : r.status === 'rate_limited' ? 429 : 400);
});

const smallPageHeaders = () => securityHeaders({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
});
const smallPage = (title: string, body: string, status = 200) => new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><meta name="referrer" content="no-referrer"/><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 18px;color:#0f172a}button{font:inherit;font-weight:700;background:#7856ff;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}.muted{color:#475569;font-size:14px}</style></head><body><h1>${title}</h1>${body}</body></html>`, { status, headers: smallPageHeaders() });
const tokenParam = (req: Request) => { const t = new URL(req.url).searchParams.get('t') ?? ''; return /^[0-9a-f]{64}$/.test(t) ? t : null; };

/** GET toont een knop, POST bevestigt (mailscanners openen GET-links automatisch). */
export const emailConfirm = httpAction(async (ctx, req) => {
  const t = tokenParam(req);
  if (!t) return smallPage('Link ongeldig', '<p>Deze bevestigingslink is ongeldig.</p>', 400);
  if (req.method === 'GET') {
    return smallPage('Meldingen bevestigen', `<p>Wil je e-mails ontvangen over deze SafeWalk-meekijklink (SOS, gemiste check-in, aankomst, batterij bijna leeg, niet meer live)?</p><form method="post" action="?t=${t}"><button type="submit">Ja, bevestigen</button></form><p class="muted">Je kunt je in elke e-mail weer afmelden. Na het einde van de link worden je adres en aanmelding gewist.</p>`);
  }
  const ok = await ctx.runMutation(internal.viewerAlerts.confirm, { token: t });
  return ok
    ? smallPage('Bevestigd', '<p>Je krijgt nu e-mails over deze meekijklink zolang de reis loopt. Houd zelf ook contact: e-mail kan vertraging hebben.</p>')
    : smallPage('Niet gelukt', '<p>Deze bevestiging is verlopen, al gebruikt, of de link is niet meer geldig.</p>', 410);
});

/** Afmelden: GET toont een knop; POST (ook One-Click uit de mailapp, RFC 8058) meldt af. */
export const emailStop = httpAction(async (ctx, req) => {
  const t = tokenParam(req);
  if (!t) return smallPage('Link ongeldig', '<p>Deze afmeldlink is ongeldig.</p>', 400);
  if (req.method === 'GET') {
    return smallPage('Afmelden', `<p>Geen e-mails meer ontvangen over deze SafeWalk-meekijklink?</p><form method="post" action="?t=${t}"><button type="submit">Afmelden</button></form>`);
  }
  await ctx.runMutation(internal.viewerAlerts.unsubscribe, { token: t });
  return smallPage('Afgemeld', '<p>Je bent afgemeld. Je krijgt over deze link geen e-mails meer.</p>');
});

/**
 * GET /track/recording?token&id — streams stored bytes (ciphertext for e2e-v1) through a proxy.
 * Token, revoke, expiry and incident scope are re-checked on EVERY request; no storage URL is ever exposed.
 * Bytes already downloaded by a recipient cannot be revoked.
 */
export const MAX_PROXY_BYTES = 19 * 1024 * 1024 + 64;
export const publicRecording = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const recordingId = url.searchParams.get('id') ?? '';
  const h = securityHeaders({ 'Content-Type': 'application/json' });
  if (!recordingId) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: h });
  let resolved: { storageId: string; mime: string; byteSize: number } | null = null;
  try {
    resolved = await ctx.runQuery(internal.tracking.resolveRecordingDownload, { token, recordingId: recordingId as never });
  } catch { resolved = null; }
  if (!resolved) return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 404, headers: h });
  if (resolved.byteSize > MAX_PROXY_BYTES) return new Response(JSON.stringify({ error: 'too_large' }), { status: 413, headers: h });
  const blob = await ctx.storage.get(resolved.storageId as never);
  if (!blob) return new Response(JSON.stringify({ error: 'gone' }), { status: 404, headers: h });
  return new Response(blob, { status: 200, headers: securityHeaders({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store, private' }) });
});

const LEAFLET_JS_SRI = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
const LEAFLET_CSS_SRI = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';

export const publicPage = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token });
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  const htmlHeaders = securityHeaders({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': [
      "default-src 'none'",
      "img-src https://tile.openstreetmap.org data:",
      "style-src 'unsafe-inline' https://unpkg.com",
      "script-src 'unsafe-inline' https://unpkg.com",
      "connect-src 'self' " + site,
      "font-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  });
  if (!data) {
    return new Response('<!doctype html><meta charset=utf-8><meta name="robots" content="noindex"/><meta name="referrer" content="no-referrer"/><title>Link ongeldig</title><p>Deze SafeWalk-link is ongeldig, verlopen of ingetrokken.</p>', {
      status: 404, headers: htmlHeaders,
    });
  }
  const html = liveTrackHtml({
    api: `${site}/track/location?token=${encodeURIComponent(token)}`,
    player: `${site}/track/recording-play`,
    token,
    downloadUrl: downloadUrl(),
    unlock: `${site}/track/unlock`,
    subscribe: `${site}/track/subscribe`,
    leafletJsSri: LEAFLET_JS_SRI,
    leafletCssSri: LEAFLET_CSS_SRI,
  });
  return new Response(html, { status: 200, headers: htmlHeaders });
});


/** Ciphertext-only metadata for external E2E player (no keys; fragment holds DEK). */
export const resolveRecordingMeta = internalQuery({
  args: { token: v.string(), recordingId: v.id('recordings') },
  handler: async (ctx, { token, recordingId }) => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const link = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
    if (!link || link.revokedAt || link.expiresAt < Date.now()) return null;
    if (!(link.scopes ?? []).includes('recording')) return null;
    const row = await ctx.db.get(recordingId);
    if (!row || row.deletedAt || row.userId !== link.userId) return null;
    // Strict: a recording-scoped link only exposes recordings of its own incident.
    if (!link.incidentId || row.incidentId !== link.incidentId) return null;
    const enc = (row.encryption ?? 'none') as 'none' | 'e2e-v1';
    return {
      storageId: row.storageId,
      mime: row.mime,
      byteSize: row.byteSize,
      encryption: enc,
      clientUploadId: row.clientUploadId ?? null,
      ownerId: row.userId,
    };
  },
});

/**
 * Isolated player page: NO third-party scripts (CSP default-src none + unsafe-inline only).
 * DEK must come from location.hash only; never query/path. Legacy plaintext plays without key.
 */
export const publicRecordingPlayer = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const recordingId = url.searchParams.get('id') ?? '';
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  const h = securityHeaders({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "media-src 'self' blob: " + site,
      "connect-src 'self' " + site,
      "img-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  });
  if (!recordingId) {
    return new Response('<!doctype html><meta charset=utf-8><meta name="referrer" content="no-referrer"/><p>Ongeldig.</p>', { status: 400, headers: h });
  }
  let meta: { encryption: string; clientUploadId: string | null; ownerId: string; mime: string } | null = null;
  try {
    const resolved = await ctx.runQuery(internal.tracking.resolveRecordingMeta, { token, recordingId: recordingId as never });
    if (!resolved) {
      return new Response('<!doctype html><meta charset=utf-8><meta name="referrer" content="no-referrer"/><p>Link ongeldig, verlopen of zonder recording-scope.</p>', { status: 404, headers: h });
    }
    meta = resolved;
  } catch {
    return new Response('<!doctype html><meta charset=utf-8><p>Fout.</p>', { status: 404, headers: h });
  }
  const signed = `${site}/track/recording?token=${encodeURIComponent(token)}&id=${encodeURIComponent(recordingId)}`;
  if (!meta) {
    return new Response('<!doctype html><meta charset=utf-8><p>Bestand weg.</p>', { status: 404, headers: h });
  }
  const html = `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="referrer" content="no-referrer"/>
<title>SafeWalk opname</title>
<style>
body{font:16px/1.4 system-ui;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
.warn{background:#7f1d1d;padding:12px;border-radius:8px;margin:12px 0}
.ok{background:#14532d;padding:12px;border-radius:8px;margin:12px 0}
audio{width:100%;margin-top:16px}
code{font-size:12px;word-break:break-all}
</style></head><body>
<h1>SafeWalk opname</h1>
<p id="status">Laden…</p>
<div id="box"></div>
<script>
(function(){
  var ENC=${JSON.stringify(meta.encryption)};
  var URL_CT=${JSON.stringify(signed)};
  var MIME=${JSON.stringify(meta.mime)};
  var OWNER=${JSON.stringify(meta.ownerId)};
  var UPLOAD=${JSON.stringify(meta.clientUploadId)};
  var status=document.getElementById('status');
  var box=document.getElementById('box');
  function b64urlToBytes(s){
    s=s.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4) s+='=';
    var bin=atob(s); var out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
    return out;
  }
  function parseKey(hash){
    var m=/^#?k=v1\.([A-Za-z0-9_-]+)$/.exec(hash||'');
    return m?b64urlToBytes(m[1]):null;
  }
  async function playPlain(){
    status.innerHTML='<div class="warn">LEGACY: opname is <strong>niet</strong> end-to-end versleuteld. Server/storage kon bytes zien bij ACL-toegang. Intrekken stopt nieuwe toegang; wat al gedownload is, kan niet worden ingetrokken.</div>';
    var a=document.createElement('audio'); a.controls=true; a.src=URL_CT; box.appendChild(a);
  }
  async function playE2e(){
    var dek=parseKey(location.hash);
    if(!dek||dek.length!==32){
      status.innerHTML='<div class="warn">E2E-opname: voeg de sleutel toe in de URL-fragment (<code>#k=v1.…</code>). De sleutel wordt niet naar de server gestuurd. Zonder fragment geen afspelen.</div>';
      return;
    }
    status.textContent='Ciphertext ophalen en lokaal ontsleutelen…';
    var res=await fetch(URL_CT,{cache:'no-store',referrerPolicy:'no-referrer'});
    if(!res.ok){ status.textContent='Opname niet (meer) beschikbaar: link verlopen of ingetrokken.'; return; }
    var buf=new Uint8Array(await res.arrayBuffer());
    if(buf.length<28){ status.textContent='Bestand te kort.'; return; }
    var iv=buf.slice(0,12); var ct=buf.slice(12);
    var aadStr='safewalk-rec-aad-v1|'+OWNER+'|'+(UPLOAD||'');
    var aad=new TextEncoder().encode(aadStr);
    try{
      var key=await crypto.subtle.importKey('raw',dek,{name:'AES-GCM'},false,['decrypt']);
      var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv,additionalData:aad,tagLength:128},key,ct);
      var blob=new Blob([pt],{type:MIME.indexOf('audio/')===0?MIME:'audio/webm'});
      var a=document.createElement('audio'); a.controls=true; a.src=URL.createObjectURL(blob); box.appendChild(a);
      status.innerHTML='<div class="ok">E2E: lokaal ontsleuteld. Fragment-sleutel is niet naar SafeWalk gestuurd. Intrekken voorkomt nieuwe downloads; wat al gedownload is, kan niet worden ingetrokken.</div>';
    }catch(e){
      status.innerHTML='<div class="warn">Ontsleutelen mislukt (verkeerde/ontbrekende sleutel of manipulatiedetectie).</div>';
    }
  }
  if(ENC==='e2e-v1') playE2e(); else playPlain();
})();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: h });
});
