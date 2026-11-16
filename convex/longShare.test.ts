/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { SHARE_MAX_MS, SHARE_RENEW_PROMPT_MS, clampShareEnd, shareExpiry, shouldPromptRenewal } from './longShare';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;
const H = 3600_000;

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, birthYear = 1990) => {
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name, email: `${name}@test.invalid` });
      await ctx.db.insert('profiles', { userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: true, restricted: false, birthYear, birthMonth: 1 });
      await ctx.db.insert('subscriptions', { userId, tier: 'free' });
      return userId;
    });
    return { id, as: t.withIdentity({ subject: `${id}|session-${name}` }) };
  };
  const a = await mk('anna'); const b = await mk('bram'); const minor = await mk('mini', new Date().getUTCFullYear() - 14);
  const invite = async () => {
    const token = await a.as.mutation(api.contacts.createInvitation, {});
    await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
  };
  const run = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, a, b, minor, invite, run };
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key-not-real');
  vi.stubEnv('CONVEX_SITE_URL', 'https://site.test');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    if (String(url).startsWith('https://api.resend.com')) return new Response('{"id":"x"}', { status: 200 });
    const body = JSON.parse(init.body);
    if (String(url).endsWith('/getReceipts')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    return new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok', id: 'ticket' })) }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('duurregels (24 uur limiet)', () => {
  test('1/4/8/24 uur en tot-ik-stop', () => {
    const now = 1_700_000_000_000;
    expect(shareExpiry('1h', now)).toEqual({ endsAt: now + H, untilStop: false });
    expect(shareExpiry('4h', now)).toEqual({ endsAt: now + 4 * H, untilStop: false });
    expect(shareExpiry('8h', now)).toEqual({ endsAt: now + 8 * H, untilStop: false });
    expect(shareExpiry('24h', now)).toEqual({ endsAt: now + SHARE_MAX_MS, untilStop: false });
    expect(shareExpiry('until_stop', now)).toEqual({ endsAt: now + SHARE_MAX_MS, untilStop: true });
    expect(clampShareEnd(now + 30 * H, now)).toBe(now + SHARE_MAX_MS);
    expect(shouldPromptRenewal({ kind: 'share', shareUntilStop: true, expectedArrival: now + SHARE_RENEW_PROMPT_MS }, now)).toBe(true);
    expect(shouldPromptRenewal({ kind: 'share', shareUntilStop: true, expectedArrival: now + 2 * H }, now)).toBe(false);
    expect(shouldPromptRenewal({ kind: 'share', shareUntilStop: false, expectedArrival: now + 30 * MIN }, now)).toBe(false);
    expect(shouldPromptRenewal({ kind: 'timer', shareUntilStop: true, expectedArrival: now + 30 * MIN }, now)).toBe(false);
  });
});

describe('langdurig delen op de server', () => {
  test('4 uur: geen check-in, expiresAt is de eindtijd, 13–15 blijft dicht', async () => {
    const { t, a, minor } = await setup();
    await expect(minor.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: Date.now() + 4 * H, viewerIds: [],
      link: { locationConsent: true },
    })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
    const r = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: Date.now() + 4 * H, viewerIds: [],
      link: { duration: 'arrival', locationConsent: true },
    });
    const s = (await t.run((ctx) => ctx.db.get(r.sessionId)))!;
    expect(s.kind).toBe('share');
    expect(s.expiresAt).toBe(s.expectedArrival);
    expect(s.shareUntilStop).toBeUndefined();
    const ci = await t.run(async (ctx) => ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', s._id)).first());
    expect(ci).toBeNull();
    expect(r.link?.token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('24 uur mag, langer dan 24 uur niet; reis blijft max 12 uur', async () => {
    const { a } = await setup();
    const now = Date.now();
    await expect(a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: now + 25 * H, viewerIds: [],
      link: { locationConsent: true },
    })).rejects.toThrow(/INVALID_SHARE/);
    const ok = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: now + 24 * H, viewerIds: [],
      link: { locationConsent: true },
    });
    expect(ok.sessionId).toBeTruthy();
    await expect(a.as.mutation(api.sessions.begin, {
      destination: 'Thuis', expectedArrival: now + 13 * H, viewerIds: [],
      link: { locationConsent: true },
    })).rejects.toThrow(/INVALID_ARRIVAL/);
  });

  test('tot ik stop: limiet 24 uur, stoppen kan altijd, verlengen schuift 24 uur op', async () => {
    const { t, a } = await setup();
    const now = Date.now();
    const r = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen (tot ik stop)', expectedArrival: now + SHARE_MAX_MS,
      shareUntilStop: true, viewerIds: [], link: { duration: 'arrival', locationConsent: true },
    });
    const s = (await t.run((ctx) => ctx.db.get(r.sessionId)))!;
    expect(s.shareUntilStop).toBe(true);
    expect(s.expiresAt - now).toBeGreaterThan(23 * H);
    expect(s.expiresAt - now).toBeLessThanOrEqual(SHARE_MAX_MS);

    // vaste duur mag niet verlengd worden
    const fixed = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: Date.now() + 4 * H, viewerIds: [],
      link: { locationConsent: true },
    });
    await expect(a.as.mutation(api.sessions.renewShare, { sessionId: fixed.sessionId })).rejects.toThrow(/BAD_REQUEST/);

    // opnieuw starten vervangt de vorige; start until_stop opnieuw
    const r2 = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen (tot ik stop)', expectedArrival: Date.now() + SHARE_MAX_MS,
      shareUntilStop: true, viewerIds: [], link: { locationConsent: true },
    });
    const renewed = await a.as.mutation(api.sessions.renewShare, { sessionId: r2.sessionId });
    expect(renewed.endsAt - Date.now()).toBeGreaterThan(23 * H);
    expect(renewed.endsAt - Date.now()).toBeLessThanOrEqual(SHARE_MAX_MS);

    await a.as.mutation(api.sessions.end, { sessionId: r2.sessionId });
    const ended = (await t.run((ctx) => ctx.db.get(r2.sessionId)))!;
    expect(ended.endedAt).toBeTruthy();
    expect(ended.status).toBe('ended');

    // cron sluit een verlopen deelperiode
    const r3 = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: Date.now() + 10 * MIN, viewerIds: [],
      link: { locationConsent: true },
    });
    await t.run(async (ctx) => { const s3 = await ctx.db.get(r3.sessionId); await ctx.db.patch(s3!._id, { expiresAt: Date.now() - 1000, expectedArrival: Date.now() - 1000 }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    const closed = (await t.run((ctx) => ctx.db.get(r3.sessionId)))!;
    expect(closed.status).toBe('expired');
    expect(closed.endedAt).toBeTruthy();
  });

  test('kijkers in de app en meekijkpagina tonen share-status', async () => {
    const { t, a, b, invite } = await setup();
    await invite();
    const r = await a.as.mutation(api.sessions.begin, {
      kind: 'share', destination: 'Locatie delen', expectedArrival: Date.now() + 4 * H, viewerIds: [b.id],
      link: { duration: 'arrival', locationConsent: true },
    });
    const over = await b.as.query(api.sessions.overview, {});
    expect(over.watching[0]?.kind).toBe('share');
    expect(r.link?.token).toMatch(/^[0-9a-f]{64}$/);
    const pub = await t.query(internal.tracking.resolvePublic, { token: r.link!.token });
    expect(pub?.trip?.kind).toBe('share');
    expect(pub?.trip?.state).toBe('underway');
  });
});
