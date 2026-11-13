/// <reference types="vite/client" />
// Groeifuncties: vrienden uitnodigen (1 maand Premium), meekijklink voor een reis, batterij/laatst-online bij gemiste check-in.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MAX_REWARDS_PER_YEAR, REFERRAL_MS } from './referrals';
import { deviceStatusHint, deviceStatusLine, normalizeBatteryPct } from './deviceStatus';
import { downloadUrl, DEFAULT_DOWNLOAD_URL, liveTrackHtml, tripState } from './trackPage';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;
const DAY = 24 * 3600_000;

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
  const users = await Promise.all(['testA', 'testB', 'testC', 'testD', 'testE', 'testF'].map((n) => mk(n)));
  const minor = await mk('testMinor', new Date().getUTCFullYear() - 14);
  const invite = async (from: (typeof users)[number], to: (typeof users)[number]) => {
    const token = await from.as.mutation(api.contacts.createInvitation, {});
    return to.as.mutation(api.contacts.respondInvitation, { token, accept: true });
  };
  return { t, users, minor, invite };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (String(_url).endsWith('/getReceipts')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    return new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok', id: 'ticket' })) }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('vrienden uitnodigen: 1 maand Premium voor allebei', () => {
  test('nieuw vertrouwd contact → beide 30 dagen Premium (alleen Convex-gift, geen winkelabonnement)', async () => {
    const { users: [a, b], invite } = await setup();
    expect((await a.as.query(api.billing.status, {}))!.premium).toBe(false);
    const res = await invite(a, b);
    expect(res.referral).toBe('rewarded');
    for (const u of [a, b]) {
      const st = (await u.as.query(api.billing.status, {}))!;
      expect(st.premium).toBe(true);
      expect(st.storePremium).toBe(false);
      expect(st.grantUntil! - Date.now()).toBeGreaterThan(REFERRAL_MS - MIN);
      expect(st.grantUntil! - Date.now()).toBeLessThanOrEqual(REFERRAL_MS);
    }
    // Premium-functie werkt dan echt server-side: contactlimiet 20.
    expect((await a.as.query(api.contacts.list, {})).limit).toBe(20);
    const mine = (await a.as.query(api.referrals.mine, {}))!;
    expect(mine).toMatchObject({ rewardsThisYear: 1, remaining: MAX_REWARDS_PER_YEAR - 1, days: 30 });
  });

  test('beloningen stapelen aaneengesloten; genodigde krijgt maar één keer een beloning', async () => {
    const { users: [a, b, c], invite } = await setup();
    await invite(a, b);
    await invite(a, c);
    const grants = await a.as.query(api.billing.status, {});
    expect(grants!.grantUntil! - Date.now()).toBeGreaterThan(2 * REFERRAL_MS - MIN);
    // c is al beloond als genodigde → b nodigt c uit: geen nieuwe beloning
    const res = await invite(b, c);
    expect(res.referral).toBe('invitee_already_rewarded');
  });

  test('geen beloning bij opnieuw toevoegen of omgekeerd paar', async () => {
    const { t, users: [a, b], invite } = await setup();
    await invite(a, b);
    const tc = (await a.as.query(api.contacts.list, {})).mine[0];
    await a.as.mutation(api.contacts.remove, { id: tc.id as Id<'trustedContacts'> });
    expect((await invite(a, b)).referral).toBe('not_new');
    expect((await invite(b, a)).referral).toBe('not_new'); // omgekeerde relatie bestond al
    const n = await t.run(async (ctx) => (await ctx.db.query('referrals').collect()).filter((r) => r.status === 'rewarded').length);
    expect(n).toBe(1);
  });

  test(`maximaal ${MAX_REWARDS_PER_YEAR} beloningen per jaar per uitnodiger`, async () => {
    const { t, users: [a, b, c, d, e], invite } = await setup();
    // Premium via winkel, zodat de contactlimiet niet in de weg zit
    await t.run(async (ctx) => { const s = (await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', a.id)).first())!; await ctx.db.patch(s._id, { tier: 'premium' }); });
    for (const u of [b, c, d]) expect((await invite(a, u)).referral).toBe('rewarded');
    expect((await invite(a, e)).referral).toBe('inviter_limit');
    expect((await e.as.query(api.billing.status, {}))!.grantUntil).toBeNull();
  });

  test('13–15: geen beloning en niets vastgelegd over de minderjarige', async () => {
    const { t, users: [a], minor, invite } = await setup();
    expect((await invite(a, minor)).referral).toBe('not_adult');
    expect(await t.run((ctx) => ctx.db.query('referrals').collect())).toHaveLength(0);
    expect((await a.as.query(api.billing.status, {}))!.grantUntil).toBeNull();
  });

  test('gift verloopt; account verwijderen wist giften en eigen uitnodigingsregels', async () => {
    const { t, users: [a, b], invite } = await setup();
    await invite(a, b);
    await t.run(async (ctx) => { for (const g of await ctx.db.query('premiumGrants').collect()) await ctx.db.patch(g._id, { expiresAt: Date.now() - 1 }); });
    expect((await a.as.query(api.billing.status, {}))!.premium).toBe(false);
    await a.as.mutation(api.account.deleteAccount, { confirm: 'VERWIJDER' });
    const left = await t.run(async (ctx) => ({ grants: await ctx.db.query('premiumGrants').collect(), refs: await ctx.db.query('referrals').collect() }));
    expect(left.grants.every((g) => g.userId !== a.id)).toBe(true);
    expect(left.refs.every((r) => r.inviterId !== a.id)).toBe(true);
  });
});

describe('batterij en laatst online', () => {
  test('pure helpers', () => {
    expect(normalizeBatteryPct(-1)).toBeUndefined();
    expect(normalizeBatteryPct(101)).toBeUndefined();
    expect(normalizeBatteryPct(NaN)).toBeUndefined();
    expect(normalizeBatteryPct(41.6)).toBe(42);
    expect(deviceStatusLine({})).toBe('');
    const at = Date.UTC(2026, 10, 13, 20, 4);
    expect(deviceStatusLine({ batteryPct: 12, batteryAt: at, lastSeenAt: at })).toBe('Batterij 12% (21:04) · laatst online 21:04');
    expect(deviceStatusLine({ lastSeenAt: at })).toBe('Laatst online 21:04');
    expect(deviceStatusHint({ batteryPct: 8 }, at)).toMatch(/bijna leeg/);
    expect(deviceStatusHint({ batteryPct: 80, lastSeenAt: at - 20 * MIN }, at)).toMatch(/niets doorgegeven/);
    expect(deviceStatusHint({ batteryPct: 80, lastSeenAt: at - MIN }, at)).toBeNull();
  });

  test('gemiste check-in: melding bevat batterij en laatst online; einde reis wist ze', async () => {
    vi.useFakeTimers();
    const { t, users: [a, b], invite } = await setup();
    await invite(a, b);
    await b.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[testB]' });
    const sid = await a.as.mutation(api.sessions.start, { destination: 'Teststraat 1', expectedArrival: Date.now() + 10 * MIN, viewerIds: [b.id] });
    await a.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now(), batteryPct: 12 });
    await a.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now(), batteryPct: -1 }); // web: onbekend → oude waarde blijft
    let s = (await t.run((ctx) => ctx.db.get(sid)))!;
    expect(s.batteryPct).toBe(12); expect(s.lastSeenAt).toBeTypeOf('number');
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 6 * MIN }); });
    expect(await t.mutation(internal.monitor.checkDeadlines, {})).toBe(1);
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect()))[0];
    expect(alert.batteryPct).toBe(12); expect(alert.lastSeenAt).toBe(s.lastSeenAt);
    const msg = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).find((m) => m.kind === 'missed_check_in')!;
    expect(msg.body).toMatch(/Batterij 12% \(\d\d:\d\d\) · laatst online \d\d:\d\d\./);
    await a.as.mutation(api.sessions.end, { sessionId: sid });
    s = (await t.run((ctx) => ctx.db.get(sid)))!;
    expect(s.batteryPct).toBeUndefined(); expect(s.lastSeenAt).toBeUndefined();
    // na 30 dagen ook uit de melding
    await t.run(async (ctx) => { await ctx.db.patch(alert._id, {}); });
    vi.setSystemTime(Date.now() + 31 * DAY);
    await t.mutation(internal.monitor.purge, {});
    const old = (await t.run((ctx) => ctx.db.get(alert._id)))!;
    expect(old.batteryPct).toBeUndefined(); expect(old.lastSeenAt).toBeUndefined();
  });
});

describe('meekijklink voor een reis (zonder app)', () => {
  const start = async (a: { as: ReturnType<ReturnType<typeof convexTest>['withIdentity']> }, viewer: Id<'users'>, minutes = 30) =>
    a.as.mutation(api.sessions.start, { destination: 'Teststraat 1', expectedArrival: Date.now() + minutes * MIN, viewerIds: [viewer] });

  test('onderweg → respijt → gemist; status en locatie alleen zolang de reis loopt', async () => {
    const { t, users: [a, b], invite } = await setup();
    await invite(a, b);
    const sid = await start(a, b.id);
    await a.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now(), batteryPct: 55 });
    const link = await a.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: true });
    let r = (await t.query(internal.tracking.resolvePublic, { token: link.token }))!;
    expect(r.trip).toMatchObject({ destination: 'Teststraat 1', state: 'underway', batteryPct: 55 });
    expect(r.location?.lat).toBe(52.1); expect(r.live).toBe(true);
    // check-in verlopen, nog in respijt
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - MIN }); });
    r = (await t.query(internal.tracking.resolvePublic, { token: link.token }))!;
    expect(r.trip!.state).toBe('grace'); expect(r.trip!.graceEndsAt).toBeGreaterThan(Date.now());
    // respijt voorbij → gemist
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    r = (await t.query(internal.tracking.resolvePublic, { token: link.token }))!;
    expect(r.trip!.state).toBe('missed'); expect(r.location).not.toBeNull();
    // bevestigd → aangekomen, geen locatie of batterij meer
    await a.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 0 });
    r = (await t.query(internal.tracking.resolvePublic, { token: link.token }))!;
    expect(r.trip).toMatchObject({ state: 'arrived', batteryPct: null, lastSeenAt: null });
    expect(r.location).toBeNull(); expect(r.live).toBe(false);
  });

  test('gestopt → "ended"; intrekken en verlopen → link dood', async () => {
    const { t, users: [a, b], invite } = await setup();
    await invite(a, b);
    const sid = await start(a, b.id);
    const link = await a.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: true });
    const row = (await t.run((ctx) => ctx.db.get(link.id)))!;
    expect(row.tokenHash).not.toBe(link.token); // alleen hash opgeslagen
    expect(row.expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 3600_000);
    await a.as.mutation(api.sessions.end, { sessionId: sid });
    expect((await t.query(internal.tracking.resolvePublic, { token: link.token }))!.trip!.state).toBe('ended');
    await a.as.mutation(api.tracking.revokeShareLink, { id: link.id });
    expect(await t.query(internal.tracking.resolvePublic, { token: link.token })).toBeNull();
  });

  test('alleen eigenaar, 16+, actieve reis en expliciete toestemming', async () => {
    const { t, users: [a, b, c], minor, invite } = await setup();
    await invite(a, b);
    const sid = await start(a, b.id);
    await expect(c.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: true })).rejects.toThrow(/FORBIDDEN/);
    await expect(a.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: false })).rejects.toThrow(/LOCATION_CONSENT_REQUIRED/);
    await expect(minor.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: true })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
    await a.as.mutation(api.sessions.end, { sessionId: sid });
    await expect(a.as.mutation(api.tracking.createTripLink, { sessionId: sid, locationConsent: true })).rejects.toThrow(/SESSION_CLOSED/);
    void t;
  });

  test('pure: tripState, download-link en HTML-escaping', () => {
    const now = 1_000_000_000;
    const s = { status: 'active', expectedArrival: now + MIN, expiresAt: now + DAY };
    expect(tripState(s, { status: 'pending', dueAt: now + MIN, graceMinutes: 5 }, now).state).toBe('underway');
    expect(tripState(s, { status: 'pending', dueAt: now - MIN, graceMinutes: 5 }, now)).toEqual({ state: 'grace', graceEndsAt: now + 4 * MIN });
    expect(tripState({ ...s, status: 'alert' }, { status: 'missed', dueAt: now - MIN, graceMinutes: 5 }, now).state).toBe('missed');
    expect(tripState({ ...s, status: 'ended', endedAt: now }, { status: 'confirmed', dueAt: now, graceMinutes: 5 }, now).state).toBe('arrived');
    expect(tripState({ ...s, status: 'expired', endedAt: now }, { status: 'cancelled', dueAt: now, graceMinutes: 5 }, now).state).toBe('ended');
    expect(tripState({ ...s, expiresAt: now - 1 }, null, now).state).toBe('ended');
    expect(downloadUrl(undefined)).toBe(DEFAULT_DOWNLOAD_URL);
    expect(downloadUrl('javascript:alert(1)')).toBe(DEFAULT_DOWNLOAD_URL);
    expect(downloadUrl('https://example.test/app')).toBe('https://example.test/app');
    const html = liveTrackHtml({ api: 'https://x.test/track/location?token=</script>', player: 'p', token: 't', downloadUrl: DEFAULT_DOWNLOAD_URL, leafletJsSri: 's', leafletCssSri: 'c' });
    expect(html).toContain('Ook veilig thuiskomen?');
    expect(html).toContain('Download SafeWalk');
    expect(html).not.toContain('token=</script>');
    expect(html).toContain('function esc(');
  });
});
