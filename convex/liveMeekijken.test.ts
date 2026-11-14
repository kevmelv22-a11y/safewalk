/// <reference types="vite/client" />
// Live meekijken 2.0: reis met alleen een link, timers, privacy-check-in, toegangscode, e-mail voor kijkers,
// signalen (batterij, niet meer live, SOS) en de meekijkpagina.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  CODE_MAX_FAILURES, LOW_BATTERY_PCT, MAX_SUBSCRIBERS_PER_LINK, NOT_LIVE_AFTER_MS, linkExpiry, navigationLinks,
  normalizeAccessCode, revealDetails, shouldSignalLowBattery, shouldSignalNotLive, thinTrail, viewerEmail, isEmail,
} from './liveShare';
import { liveTrackHtml, DEFAULT_DOWNLOAD_URL } from './trackPage';
import { sendEmail } from './viewerAlerts';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;
const H = 3600_000;

type Mail = { to: string[]; subject: string; text: string; headers?: Record<string, string> };
let mails: Mail[] = [];

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
  mails = [];
  vi.stubEnv('RESEND_API_KEY', 'test-key-not-real');
  vi.stubEnv('CONVEX_SITE_URL', 'https://site.test');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    if (String(url).startsWith('https://api.resend.com')) { mails.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); }
    const body = JSON.parse(init.body);
    if (String(url).endsWith('/getReceipts')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    return new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok', id: 'ticket' })) }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const resolve = (t: Awaited<ReturnType<typeof setup>>['t'], token: string, grant?: string) =>
  t.query(internal.tracking.resolvePublic, { token, ...(grant ? { grant } : {}) });

describe('reis of timer starten met alleen een link (geen app-contact nodig)', () => {
  test('link-only: geen kijkers, wel een link; zonder link blijft NO_VIEWERS', async () => {
    const { t, a } = await setup();
    await expect(a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [] })).rejects.toThrow(/NO_VIEWERS/);
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { duration: 'arrival', locationConsent: true } });
    expect(r.link?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r.link?.accessCode).toBeNull();
    const row = (await t.run((ctx) => ctx.db.get(r.link!.id)))!;
    expect(row.tokenHash).not.toBe(r.link!.token);
    const s = (await t.run((ctx) => ctx.db.get(r.sessionId)))!;
    expect(row.expiresAt).toBe(s.expiresAt); // tot aankomst = einde van de reis
    expect((await resolve(t, r.link!.token))!.trip!.state).toBe('underway');
  });

  test('link zonder locatietoestemming kan niet; 13–15 blijft dicht', async () => {
    const { a, minor } = await setup();
    await expect(a.as.mutation(api.sessions.begin, { destination: 'X', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: false } })).rejects.toThrow(/LOCATION_CONSENT_REQUIRED/);
    await expect(minor.as.mutation(api.sessions.begin, { destination: 'X', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
  });

  test('timer zonder bestemming: geen coördinaten toegestaan, pagina zegt "timer"', async () => {
    const { t, a } = await setup();
    await expect(a.as.mutation(api.sessions.begin, { kind: 'timer', destination: 'Date', destLat: 52, destLng: 5, expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } })).rejects.toThrow(/BAD_REQUEST/);
    const r = await a.as.mutation(api.sessions.begin, { kind: 'timer', destination: 'Date', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { duration: '1h', locationConsent: true } });
    const p = (await resolve(t, r.link!.token))!;
    expect(p.trip).toMatchObject({ kind: 'timer', destination: 'Date', destinationPoint: null });
    // check-in loopt gewoon: gemist na de respijttijd
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    expect((await resolve(t, r.link!.token))!.trip!.state).toBe('missed');
  });

  test('oude app (sessions.start) werkt nog precies zoals eerst', async () => {
    const { a, b, invite } = await setup();
    await invite();
    const id = await a.as.mutation(api.sessions.start, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [b.id] });
    expect(typeof id).toBe('string');
    await expect(a.as.mutation(api.sessions.start, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [] })).rejects.toThrow(/NO_VIEWERS/);
  });
});

describe('duur van de link', () => {
  test('15 min / 1 uur / 8 uur / tot aankomst, nooit langer dan 24 uur', () => {
    const now = 1_000_000;
    expect(linkExpiry('15m', now)).toBe(now + 15 * MIN);
    expect(linkExpiry('1h', now)).toBe(now + H);
    expect(linkExpiry('8h', now)).toBe(now + 8 * H);
    expect(linkExpiry('arrival', now, now + 3 * H)).toBe(now + 3 * H);
    expect(linkExpiry('arrival', now, now + 99 * H)).toBe(now + 24 * H);
    expect(linkExpiry('arrival', now, now + 1000)).toBe(now + 5 * MIN);
  });

  test('verlengen van de reis schuift "tot aankomst"-links mee, vaste duur niet', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 20 * MIN, viewerIds: [], link: { duration: 'arrival', locationConsent: true } });
    const fixed = await a.as.mutation(api.tracking.createTripLink, { sessionId: r.sessionId, locationConsent: true, duration: '15m' });
    const before = (await t.run((ctx) => ctx.db.get(r.link!.id)))!.expiresAt;
    const fixedBefore = (await t.run((ctx) => ctx.db.get(fixed.id)))!.expiresAt;
    await a.as.mutation(api.sessions.respondCheckIn, { sessionId: r.sessionId, extendMinutes: 20 });
    expect((await t.run((ctx) => ctx.db.get(r.link!.id)))!.expiresAt).toBeGreaterThan(before);
    expect((await t.run((ctx) => ctx.db.get(fixed.id)))!.expiresAt).toBe(fixedBefore);
  });
});

describe('toegangscode op een link', () => {
  test('zonder code niets te zien; foute code telt mee; goede code geeft kijkerssleutel', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { withCode: true, locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now() });
    const code = r.link!.accessCode!;
    expect(code).toMatch(/^\d{6}$/);
    const row = (await t.run((ctx) => ctx.db.get(r.link!.id)))!;
    expect(row.codeHash).toBeTruthy(); expect(JSON.stringify(row)).not.toContain(`"${code}"`);
    const locked = (await resolve(t, r.link!.token))!;
    expect(locked).toMatchObject({ locked: true, trip: null, location: null });
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code: wrong })).toEqual({ ok: false, reason: 'wrong' });
    const ok = await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code });
    expect(ok.ok).toBe(true);
    const grant = (ok as { grant: string }).grant;
    const open = (await resolve(t, r.link!.token, grant))!;
    expect(open.locked).toBe(false); expect(open.location?.lat).toBe(52.1);
    // sleutel van een andere link werkt niet
    const other = await a.as.mutation(api.tracking.createTripLink, { sessionId: r.sessionId, locationConsent: true, withCode: true });
    expect((await resolve(t, other.token, grant))!.locked).toBe(true);
  });

  test('max. 5 foute pogingen per kwartier; na 20 in totaal definitief op slot', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { withCode: true, locationConsent: true } });
    const code = r.link!.accessCode!; const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code: wrong })).ok).toBe(false);
    // ook de goede code wordt nu even geweigerd (geen raden in bulk)
    expect(await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code })).toEqual({ ok: false, reason: 'rate_limited' });
    await t.run(async (ctx) => {
      for (const x of await ctx.db.query('rateLimits').collect()) if (x.key.startsWith('link-code:')) await ctx.db.patch(x._id, { windowStart: Date.now() - 16 * MIN });
      await ctx.db.patch(r.link!.id, { codeFailures: CODE_MAX_FAILURES - 1 });
    });
    expect(await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code: wrong })).toEqual({ ok: false, reason: 'locked' });
    expect(await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code })).toEqual({ ok: false, reason: 'locked' });
    expect((await resolve(t, r.link!.token))).toMatchObject({ locked: true, codeLocked: true });
    const mine = await a.as.query(api.tracking.myShareLinks, {});
    expect(mine.find((l) => l.id === r.link!.id)).toMatchObject({ hasCode: true, codeLocked: true });
  });

  test('pure: code-normalisatie', () => {
    expect(normalizeAccessCode(' 123 456 ')).toBe('123456');
    expect(normalizeAccessCode('12345')).toBeNull();
    expect(normalizeAccessCode('abcdef')).toBeNull();
    expect(normalizeAccessCode(123456)).toBeNull();
  });
});

describe('privacy-check-in: alleen status tot gemiste check-in of SOS', () => {
  test('link en app-kijker zien geen locatie/batterij/route; gemiste check-in geeft alles vrij', async () => {
    const { t, a, b, invite } = await setup();
    await invite();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', destLat: 52.2, destLng: 5.2, expectedArrival: Date.now() + 30 * MIN, viewerIds: [b.id], privacyMode: true, link: { locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now(), batteryPct: 40 });
    let p = (await resolve(t, r.link!.token))!;
    expect(p.location).toBeNull(); expect(p.trail).toEqual([]);
    expect(p.trip).toMatchObject({ privacyMode: true, revealed: false, batteryPct: null, lastSeenAt: null, destinationPoint: null, deviceLive: true, state: 'underway' });
    expect(await b.as.query(api.sessions.locations, { sessionId: r.sessionId })).toEqual([]);
    const g = (await b.as.query(api.sessions.get, { sessionId: r.sessionId }))!;
    expect(g.session.batteryPct).toBeUndefined(); expect(g.session.destinationLat).toBeUndefined(); expect(g.privacy).toEqual({ mode: true, revealed: false });
    // eigenaar ziet alles
    expect((await a.as.query(api.sessions.locations, { sessionId: r.sessionId })).length).toBe(1);
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    p = (await resolve(t, r.link!.token))!;
    expect(p.location?.lat).toBe(52.1);
    expect(p.trip).toMatchObject({ revealed: true, batteryPct: 40, destinationPoint: { lat: 52.2, lng: 5.2 } });
    expect((await b.as.query(api.sessions.locations, { sessionId: r.sessionId })).length).toBe(1);
  });

  test('SOS tijdens de reis geeft vrij; vals alarm sluit weer', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], privacyMode: true, link: { locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now() });
    expect((await resolve(t, r.link!.token))!.location).toBeNull();
    const alertId = await a.as.mutation(api.sos.trigger, { clientRef: 'sos-1' });
    let p = (await resolve(t, r.link!.token))!;
    expect(p.location?.lat).toBe(52.1); expect(p.trip!.signals.sosAt).toBeGreaterThan(0);
    await a.as.mutation(api.sos.cancel, { alertId });
    p = (await resolve(t, r.link!.token))!;
    expect(p.location).toBeNull(); expect(p.trip!.signals.sosAt).toBeNull();
  });

  test('pure: revealDetails', () => {
    expect(revealDetails({ status: 'active' }, 'pending')).toBe(true);
    expect(revealDetails({ status: 'active', privacyMode: true }, 'pending')).toBe(false);
    expect(revealDetails({ status: 'alert', privacyMode: true }, null)).toBe(true);
    expect(revealDetails({ status: 'active', privacyMode: true }, 'missed')).toBe(true);
    expect(revealDetails({ status: 'active', privacyMode: true, sosAt: 1 }, 'pending')).toBe(true);
  });
});

describe('meekijkpagina 2.0: route, bestemming, navigatie', () => {
  test('recente route en bestemmingspunt; na aankomst niets meer', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Station', destLat: 52.09, destLng: 5.11, expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } });
    for (let i = 0; i < 4; i++) await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1 + i / 1000, lng: 5.1, accuracyM: 10, recordedAt: Date.now() - (4 - i) * 1000 });
    let p = (await resolve(t, r.link!.token))!;
    expect(p.trail.length).toBe(4); expect(p.trail[3][0]).toBeCloseTo(52.103);
    expect(p.trip!.destinationPoint).toEqual({ lat: 52.09, lng: 5.11 });
    await a.as.mutation(api.sessions.respondCheckIn, { sessionId: r.sessionId, extendMinutes: 0 });
    p = (await resolve(t, r.link!.token))!;
    expect(p.trail).toEqual([]); expect(p.location).toBeNull(); expect(p.trip!.state).toBe('arrived');
  });

  test('pure: route uitdunnen en navigatielinks', () => {
    const pts = Array.from({ length: 500 }, (_, i) => i);
    const th = thinTrail(pts, 120);
    expect(th.length).toBe(120); expect(th[0]).toBe(0); expect(th.at(-1)).toBe(499);
    expect(thinTrail([1, 2, 3], 120)).toEqual([1, 2, 3]);
    expect(navigationLinks(52.1, 5.1)!.google).toContain('destination=52.100000,5.100000');
    expect(navigationLinks(52.1, 5.1)!.apple).toContain('daddr=52.100000,5.100000');
    expect(navigationLinks(NaN, 5)).toBeNull(); expect(navigationLinks(91, 5)).toBeNull();
  });

  test('HTML: navigatieknoppen, sleutelwaarschuwing, code-scherm, meldingen; geen script-injectie', () => {
    const html = liveTrackHtml({ api: 'https://x.test/track/location?token=</script>', player: 'p', token: 't', downloadUrl: DEFAULT_DOWNLOAD_URL, leafletJsSri: 's', leafletCssSri: 'c', unlock: 'https://x.test/track/unlock', subscribe: 'https://x.test/track/subscribe' });
    for (const s of ['Navigeer naar mij', 'Apple Kaarten', 'werkt als een sleutel', 'Toegangscode nodig', 'E-mailmeldingen aanvragen', 'Meldingen in deze browser aanzetten', 'Privacymodus', 'Niet meer live', 'Batterij bijna leeg', 'L.polyline', 'Ook veilig thuiskomen?'])
      expect(html).toContain(s);
    expect(html).not.toContain('token=</script>');
    expect(html).not.toMatch(/gegarandeerd/i);
    // anders wint #gate{display:flex} van het hidden-attribuut en ziet iedereen de codevraag
    expect(html).toContain('[hidden]{display:none!important}');
  });
});

describe('signalen: batterij bijna leeg en niet meer live', () => {
  test('batterij ≤15%: één push + e-mailsignaal per reis; niet in privacymodus', async () => {
    vi.useFakeTimers();
    const { t, a, b, invite, run } = await setup();
    await invite();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [b.id], link: { locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, recordedAt: Date.now(), batteryPct: LOW_BATTERY_PCT - 3 });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, recordedAt: Date.now(), batteryPct: 9 });
    await run();
    const pm = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pm.filter((m) => m.kind === 'low_battery' && m.recipientId === b.id).length).toBe(1);
    expect(pm.find((m) => m.kind === 'low_battery')!.title).toContain('Batterij');
    expect((await resolve(t, r.link!.token))!.trip!.signals.lowBattery).toBe(true);
    expect(shouldSignalLowBattery({ privacyMode: true }, 5)).toBe(false);
    expect(shouldSignalLowBattery({}, 16)).toBe(false);
    expect(shouldSignalLowBattery({}, 15)).toBe(true);
  });

  test('niet meer live na 10 min stilte; weer live wist het; max. 3 per reis', async () => {
    vi.useFakeTimers();
    const { t, a, b, invite, run } = await setup();
    await invite();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 60 * MIN, viewerIds: [b.id], link: { locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, recordedAt: Date.now() });
    await t.run((ctx) => ctx.db.patch(r.sessionId, { lastSeenAt: Date.now() - NOT_LIVE_AFTER_MS - MIN }));
    await t.mutation(internal.monitor.checkDeadlines, {});
    await t.mutation(internal.monitor.checkDeadlines, {});
    await run();
    const pm = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pm.filter((m) => m.kind === 'not_live' && m.recipientId === b.id).length).toBe(1);
    expect((await resolve(t, r.link!.token))!.trip!.signals.notLiveSince).toBeGreaterThan(0);
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, recordedAt: Date.now() });
    expect((await resolve(t, r.link!.token))!.trip!.signals.notLiveSince).toBeNull();
    expect(shouldSignalNotLive({ lastSeenAt: 0, notLiveCount: 3 }, NOT_LIVE_AFTER_MS * 2)).toBe(false);
    expect(shouldSignalNotLive({}, 1e12)).toBe(false); // nog nooit een punt: geen vals signaal
  });
});

describe('e-mailmeldingen voor kijkers zonder app (dubbele opt-in)', () => {
  const confirmToken = (m: Mail) => /email-confirm\?t=([0-9a-f]{64})/.exec(m.text)![1];

  test('aanmelden → bevestigen → gemiste check-in en aankomst; daarna adres gewist', async () => {
    vi.useFakeTimers();
    const { t, a, run } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now(), batteryPct: 33 });
    const token = r.link!.token;
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token, email: 'geen-adres', consent: true })).toMatchObject({ status: 'bad_email' });
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token, email: 'kijker@example.test', consent: false })).toMatchObject({ status: 'no_consent' });
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token, email: 'Kijker@Example.test', consent: true })).toMatchObject({ ok: true, status: 'pending' });
    await run();
    expect(mails.length).toBe(1);
    expect(mails[0].to).toEqual(['kijker@example.test']);
    expect(mails[0].subject).toContain('Bevestig');
    // Niet bevestigd → geen meldingen
    expect((await t.run((ctx) => ctx.db.query('viewerSubscriptions').first()))!.status).toBe('pending');
    expect(await t.mutation(internal.viewerAlerts.confirm, { token: '0'.repeat(64) })).toBe(false);
    expect(await t.mutation(internal.viewerAlerts.confirm, { token: confirmToken(mails[0]) })).toBe(true);
    // gemiste check-in → e-mail met kaartlink en batterij, één keer
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    await t.mutation(internal.monitor.checkDeadlines, {});
    await run();
    const missed = mails.filter((m) => m.subject.includes('Check-in gemist'));
    expect(missed.length).toBe(1);
    expect(missed[0].text).toContain('https://maps.google.com/?q=52.100000,5.100000');
    expect(missed[0].text).toContain('Batterij: 33%');
    expect(missed[0].text).toContain('bel 112');
    expect(missed[0].headers!['List-Unsubscribe']).toMatch(/email-stop\?t=[0-9a-f]{64}/);
    expect(missed[0].headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    // aankomst → laatste e-mail, dan status ended en bij opruimen weg
    await a.as.mutation(api.sessions.respondCheckIn, { sessionId: r.sessionId, extendMinutes: 0 });
    await run();
    expect(mails.filter((m) => m.subject.includes('Veilig aangekomen')).length).toBe(1);
    await t.mutation(internal.monitor.purge, {});
    expect(await t.run((ctx) => ctx.db.query('viewerSubscriptions').collect())).toEqual([]);
  });

  test('afmelden stopt e-mails; intrekken van de link wist adressen meteen', async () => {
    vi.useFakeTimers();
    const { t, a, run } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } });
    await t.mutation(internal.viewerAlerts.subscribe, { token: r.link!.token, email: 'een@example.test', consent: true });
    await t.mutation(internal.viewerAlerts.subscribe, { token: r.link!.token, email: 'twee@example.test', consent: true });
    await run();
    for (const m of mails) await t.mutation(internal.viewerAlerts.confirm, { token: confirmToken(m) });
    const one = (await t.run((ctx) => ctx.db.query('viewerSubscriptions').collect())).find((s) => s.email === 'een@example.test')!;
    expect(await t.mutation(internal.viewerAlerts.unsubscribe, { token: one.unsubToken })).toBe(true);
    mails = [];
    await a.as.mutation(api.sos.trigger, { clientRef: 'sos-2', lat: 52.3, lng: 4.9, locationAt: Date.now() });
    await run();
    expect(mails.map((m) => m.to[0])).toEqual(['twee@example.test']);
    expect(mails[0].subject).toContain('SOS');
    expect((await a.as.query(api.tracking.myShareLinks, {})).find((l) => l.id === r.link!.id)!.emailSubscribers).toBe(1);
    await a.as.mutation(api.tracking.revokeShareLink, { id: r.link!.id });
    expect(await t.run((ctx) => ctx.db.query('viewerSubscriptions').collect())).toEqual([]);
  });

  test('limieten: max. abonnees per link, code vereist bij link met code, geen tijdelijke link zonder reis', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { locationConsent: true } });
    for (let i = 0; i < MAX_SUBSCRIBERS_PER_LINK; i++) expect((await t.mutation(internal.viewerAlerts.subscribe, { token: r.link!.token, email: `k${i}@example.test`, consent: true })).ok).toBe(true);
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token: r.link!.token, email: 'extra@example.test', consent: true })).toMatchObject({ status: 'full' });
    const coded = await a.as.mutation(api.tracking.createTripLink, { sessionId: r.sessionId, locationConsent: true, withCode: true });
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token: coded.token, email: 'x@example.test', consent: true })).toMatchObject({ status: 'locked' });
    const loose = await a.as.mutation(api.tracking.createShareLink, { locationConsent: true, duration: '15m' });
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token: loose.token, email: 'x@example.test', consent: true })).toMatchObject({ status: 'no_trip' });
    expect(await t.mutation(internal.viewerAlerts.subscribe, { token: 'f'.repeat(64), email: 'x@example.test', consent: true })).toMatchObject({ status: 'invalid' });
  });

  test('zonder Resend-sleutel: nooit gelukt doen, fout wordt vastgelegd', async () => {
    expect(await sendEmail({ to: 'x@example.test', subject: 's', text: 't', html: 'h' }, {})).toEqual({ delivered: false, devLogged: false, error: 'EMAIL_NOT_CONFIGURED' });
    expect(isEmail('a@b.nl')).toBe(true); expect(isEmail('a@b')).toBe(false); expect(isEmail('a b@c.nl')).toBe(false);
    const m = viewerEmail('missed', { what: 'Reis naar Thuis', at: Date.now() }, 'https://site.test/track/email-stop?t=x');
    expect(m.text).toContain('Er is geen recente locatie bekend.');
    expect(m.text).not.toMatch(/gegarandeerd/i);
  });
});

describe('HTTP: meekijkpagina, code, aanmelden, bevestigen, afmelden', () => {
  test('volledige stroom via echte HTTP-routes', async () => {
    vi.useFakeTimers();
    const { t, a, run } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { withCode: true, locationConsent: true } });
    await a.as.mutation(api.sessions.addLocation, { sessionId: r.sessionId, lat: 52.1, lng: 5.1, accuracyM: 10, recordedAt: Date.now() });
    const token = r.link!.token;
    const page = await t.fetch(`/track/live?token=${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    let loc = await (await t.fetch(`/track/location?token=${token}`)).json();
    expect(loc).toMatchObject({ ok: true, locked: true }); expect(loc.location).toBeUndefined();
    const bad = await t.fetch('/track/unlock', { method: 'POST', body: JSON.stringify({ token, code: '12' }), headers: { 'Content-Type': 'application/json' } });
    expect(bad.status).toBe(403);
    const un = await t.fetch('/track/unlock', { method: 'POST', body: JSON.stringify({ token, code: r.link!.accessCode }), headers: { 'Content-Type': 'application/json' } });
    const { grant } = await un.json();
    loc = await (await t.fetch(`/track/location?token=${token}`, { headers: { 'x-safewalk-grant': grant } })).json();
    expect(loc.location.lat).toBe(52.1); expect(loc.canSubscribe).toBe(true);
    const sub = await t.fetch('/track/subscribe', { method: 'POST', body: JSON.stringify({ token, email: 'kijker@example.test', consent: true }), headers: { 'Content-Type': 'application/json', 'x-safewalk-grant': grant } });
    expect((await sub.json()).status).toBe('pending');
    await run();
    const ct = /email-confirm\?t=([0-9a-f]{64})/.exec(mails[0].text)![1];
    const get = await t.fetch(`/track/email-confirm?t=${ct}`);
    expect(await get.text()).toContain('Ja, bevestigen');
    expect((await t.run((ctx) => ctx.db.query('viewerSubscriptions').first()))!.status).toBe('pending'); // GET bevestigt niet
    expect((await t.fetch(`/track/email-confirm?t=${ct}`, { method: 'POST' })).status).toBe(200);
    const s = (await t.run((ctx) => ctx.db.query('viewerSubscriptions').first()))!;
    expect(s.status).toBe('active');
    expect((await t.fetch(`/track/email-stop?t=${s.unsubToken}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' })).status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(s._id)))!.status).toBe('unsubscribed');
    expect((await t.fetch('/track/location?token=' + 'a'.repeat(64))).status).toBe(404);
  });
});

describe('account verwijderen wist ook kijkers-e-mail en sleutels', () => {
  test('geen viewerSubscriptions/linkGrants meer na verwijderen', async () => {
    const { t, a } = await setup();
    const r = await a.as.mutation(api.sessions.begin, { destination: 'Thuis', expectedArrival: Date.now() + 30 * MIN, viewerIds: [], link: { withCode: true, locationConsent: true } });
    await t.mutation(internal.tracking.unlockLink, { token: r.link!.token, code: r.link!.accessCode! });
    const other = await a.as.mutation(api.tracking.createTripLink, { sessionId: r.sessionId, locationConsent: true });
    await t.mutation(internal.viewerAlerts.subscribe, { token: other.token, email: 'k@example.test', consent: true });
    await a.as.mutation(api.account.deleteAccount, { confirm: 'VERWIJDER' });
    expect(await t.run((ctx) => ctx.db.query('viewerSubscriptions').collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query('linkGrants').collect())).toEqual([]);
    void (null as unknown as Id<'users'>);
  });
});
