/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

import { detectSignals } from './motion';

import { ensureProfile, isAllowedRedirect } from './auth';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string) => {
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
      await ctx.db.insert('profiles', { userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: true, restricted: false, birthYear: 1990, birthMonth: 1 });
      await ctx.db.insert('subscriptions', { userId, tier: 'free' });
      return userId;
    });
    return { id, as: t.withIdentity({ subject: `${id}|session-${name}` }) };
  };
  const [owner, friend, stranger, c3, c4, admin] = await Promise.all(['owner', 'friend', 'stranger', 'c3', 'c4', 'admin'].map(mk));
  await t.run((ctx) => ctx.db.insert('admins', { userId: admin.id }));
  const connect = async (from: typeof owner, to: typeof owner) => {
    const token = await from.as.mutation(api.contacts.createInvitation, {});
    await to.as.mutation(api.contacts.respondInvitation, { token, accept: true });
  };
  const startTrip = (viewers: Id<'users'>[], minutes = 30) =>
    owner.as.mutation(api.sessions.start, { destination: 'Thuis', expectedArrival: Date.now() + minutes * MIN, viewerIds: viewers });
  const ping = (sessionId: Id<'sessions'>, lat = 52.1) =>
    owner.as.mutation(api.sessions.addLocation, { sessionId, lat, lng: 5.1, accuracyM: 12, recordedAt: Date.now() });
  return { t, owner, friend, stranger, c3, c4, admin, connect, startTrip, ping };
}

let fetchMock: ReturnType<typeof vi.fn>;
let receiptStatus: 'ok' | 'error' | 'missing' = 'ok';
let n = 0;
const okFetch = async (url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  if (url.endsWith('/getReceipts')) {
    const data = receiptStatus === 'missing' ? {} : Object.fromEntries(body.ids.map((id: string) => [id, receiptStatus === 'ok' ? { status: 'ok' } : { status: 'error', message: 'MessageRateExceeded', details: { error: 'MessageRateExceeded' } }]));
    return new Response(JSON.stringify({ data }), { status: 200 });
  }
  return new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok', id: `ticket-${++n}` })) }), { status: 200 });
};
const sends = () => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/send'));
const sentBodies = () => sends().map((c) => String(c[1].body)).join('\n');
beforeEach(() => {
  receiptStatus = 'ok';
  fetchMock = vi.fn(okFetch);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('uitnodigingen', () => {
  test('token wordt alleen als hash opgeslagen en is eenmalig', async () => {
    const { t, owner, friend, stranger } = await setup();
    const token = await owner.as.mutation(api.contacts.createInvitation, {});
    const rows = await t.run((ctx) => ctx.db.query('invitations').collect());
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    await friend.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    await expect(stranger.as.mutation(api.contacts.respondInvitation, { token, accept: true })).rejects.toThrow(/INVITATION_INVALID/);
    await expect(owner.as.mutation(api.contacts.respondInvitation, { token: 'x'.repeat(64), accept: true })).rejects.toThrow(/INVITATION_INVALID/);
  });
  test('eigen uitnodiging accepteren kan niet', async () => {
    const { owner } = await setup();
    const token = await owner.as.mutation(api.contacts.createInvitation, {});
    await expect(owner.as.mutation(api.contacts.respondInvitation, { token, accept: true })).rejects.toThrow(/INVITATION_SELF/);
  });
});

describe('locatietoegang', () => {
  test('toegestane kijker ziet locatie; vreemde, admin en anoniem niet', async () => {
    const { t, owner, friend, stranger, admin, connect, startTrip, ping } = await setup();
    await connect(owner, friend);
    const sid = await startTrip([friend.id]); await ping(sid);
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(1);
    expect(await owner.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(1);
    expect(await stranger.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    expect(await stranger.as.query(api.sessions.get, { sessionId: sid })).toBeNull();
    expect(await admin.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    expect(await t.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
  test('alleen geaccepteerde contacten kunnen als kijker worden toegevoegd', async () => {
    const { stranger, startTrip } = await setup();
    await expect(startTrip([stranger.id])).rejects.toThrow(/VIEWER_NOT_TRUSTED/);
  });
  test('geaccepteerd contact dat niet voor DEZE sessie is gekozen ziet niets', async () => {
    const { owner, friend, c3, connect, startTrip, ping } = await setup();
    await connect(owner, friend); await connect(owner, c3);
    const sid = await startTrip([friend.id]); await ping(sid);
    expect(await c3.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
  test('vreemde kan geen locatie in andermans sessie schrijven', async () => {
    const { owner, friend, stranger, connect, startTrip } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]);
    await expect(stranger.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 1, lng: 1, recordedAt: Date.now() })).rejects.toThrow(/SESSION_CLOSED/);
  });
  test('kijker intrekken → direct geen toegang', async () => {
    const { owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    await owner.as.mutation(api.sessions.revokeViewer, { sessionId: sid, viewerId: friend.id });
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
  test('contact verwijderen → toegang ingetrokken (ook door de kijker zelf)', async () => {
    const { owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    const { mine } = await owner.as.query(api.contacts.list, {});
    await friend.as.mutation(api.contacts.remove, { id: mine[0].id });
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
  test('beëindigde sessie → geen toegang en geen nieuwe locaties', async () => {
    const { owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    await owner.as.mutation(api.sessions.end, { sessionId: sid });
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    await expect(ping(sid)).rejects.toThrow(/SESSION_CLOSED/);
  });
  test('verlopen sessie → geen toegang, ook vóórdat de cron draait', async () => {
    const { t, owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    await t.run((ctx) => ctx.db.patch(sid, { expiresAt: Date.now() - 1 }));
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    await expect(ping(sid)).rejects.toThrow(/SESSION_CLOSED/);
    await t.mutation(internal.monitor.checkDeadlines, {});
    expect((await t.run((ctx) => ctx.db.get(sid)))!.status).toBe('expired');
  });
  test('blokkeren → relatie verbroken, toegang weg, nieuwe uitnodiging werkt niet', async () => {
    const { owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    await friend.as.mutation(api.contacts.block, { userId: owner.id });
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    expect((await owner.as.query(api.contacts.list, {})).mine).toHaveLength(0);
    const token = await owner.as.mutation(api.contacts.createInvitation, {});
    await expect(friend.as.mutation(api.contacts.respondInvitation, { token, accept: true })).rejects.toThrow(/INVITATION_INVALID/);
  });
  test('eigen locatiegeschiedenis verwijderen', async () => {
    const { owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid); await ping(sid, 52.2);
    expect(await owner.as.mutation(api.sessions.deleteMyHistory, {})).toBe(2);
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
});

test('gratis limiet: max 2 contacten (server-side), premium meer', async () => {
  const { t, owner, friend, c3, c4, connect } = await setup();
  await connect(owner, friend); await connect(owner, c3);
  const token = await owner.as.mutation(api.contacts.createInvitation, {});
  await expect(c4.as.mutation(api.contacts.respondInvitation, { token, accept: true })).rejects.toThrow(/CONTACT_LIMIT/);
  await t.run(async (ctx) => { const s = (await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', owner.id)).first())!; await ctx.db.patch(s._id, { tier: 'premium' }); });
  await c4.as.mutation(api.contacts.respondInvitation, { token, accept: true });
  expect((await owner.as.query(api.contacts.list, {})).mine).toHaveLength(3);
});

describe('SOS', () => {
  test('registreert incident, pusht naar contacten met locatie en legt status per ontvanger vast', async () => {
    vi.useFakeTimers();
    const { t, owner, friend, c3, connect } = await setup();
    await connect(owner, friend); await connect(owner, c3);
    await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[friend]', platform: 'ios' });
    const alertId = await owner.as.mutation(api.sos.trigger, { clientRef: 'ref-1', lat: 52.3, lng: 4.9, accuracyM: 10, locationAt: Date.now() });
    // idempotent: offline-wachtrij kan opnieuw proberen
    expect(await owner.as.mutation(api.sos.trigger, { clientRef: 'ref-1' })).toBe(alertId);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sends()).toHaveLength(1);
    expect(sentBodies()).toContain('52.3,4.9');
    const res = (await owner.as.query(api.sos.get, { alertId }))!;
    const byName = Object.fromEntries(res.deliveries.map((d) => [d.name, d.status]));
    expect(byName).toEqual({ friend: 'delivered', c3: 'no_token' }); // receipt opgehaald
    expect(await friend.as.query(api.sos.get, { alertId })).not.toBeNull();
    const { stranger } = await setup();
    expect(await stranger.as.query(api.sos.get, { alertId })).toBeNull();
  });
  test('mislukte push → status failed en nieuwe poging', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    const { t, owner, friend, connect } = await setup();
    await connect(owner, friend);
    await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[f]' });
    const alertId = await owner.as.mutation(api.sos.trigger, { clientRef: 'ref-2' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sends()).toHaveLength(4); // 1 + 3 retries
    expect((await owner.as.query(api.sos.get, { alertId }))!.deliveries[0].status).toBe('failed');
  });
  test('annuleren (vals alarm) en rate limit', async () => {
    const { owner, friend, connect } = await setup();
    await connect(owner, friend);
    const a = await owner.as.mutation(api.sos.trigger, { clientRef: 'c0' });
    await owner.as.mutation(api.sos.cancel, { alertId: a });
    expect((await owner.as.query(api.sos.get, { alertId: a }))!.alert.status).toBe('cancelled');
    await expect(friend.as.mutation(api.sos.cancel, { alertId: a })).rejects.toThrow(/NOT_FOUND/);
    for (let i = 1; i < 5; i++) await owner.as.mutation(api.sos.trigger, { clientRef: `c${i}` });
    await expect(owner.as.mutation(api.sos.trigger, { clientRef: 'c99' })).rejects.toThrow(/RATE_LIMITED/);
  });
});

describe('check-in', () => {
  test('gemiste check-in escaleert server-side met laatste locatie en pusht naar kijkers', async () => {
    vi.useFakeTimers();
    const { t, owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend);
    await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[friend]' });
    const sid = await startTrip([friend.id], 10); await ping(sid, 52.37);
    expect(await t.mutation(internal.monitor.checkDeadlines, {})).toBe(0); // nog niet verlopen
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').withIndex('by_session', (q) => q.eq('sessionId', sid)).first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 6 * MIN }); });
    expect(await t.mutation(internal.monitor.checkDeadlines, {})).toBe(1);
    expect(await t.mutation(internal.monitor.checkDeadlines, {})).toBe(0); // niet dubbel
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect()))[0];
    expect(alert.kind).toBe('missed_check_in'); expect(alert.lat).toBe(52.37);
    expect(sentBodies()).toContain('niet op tijd');
    const own = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).filter((m) => m.recipientId === owner.id);
    expect(own.map((m) => m.kind)).toContain('check_in_required'); // gebruiker zelf (hier zonder token → no_token)
    expect(own.every((m) => m.status === 'no_token')).toBe(true);
    expect((await friend.as.query(api.sessions.get, { sessionId: sid }))!.session.status).toBe('alert');
  });
  test('binnen respijt geen escalatie; verlengen max 3×; bevestigen beëindigt sessie', async () => {
    const { t, owner, friend, connect, startTrip } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id], 10);
    await t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - 2 * MIN }); });
    expect(await t.mutation(internal.monitor.checkDeadlines, {})).toBe(0);
    for (let i = 0; i < 3; i++) await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 10 });
    await expect(owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 10 })).rejects.toThrow(/EXTENSION_NOT_ALLOWED/);
    await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 0 });
    expect(await friend.as.query(api.sessions.get, { sessionId: sid })).toBeNull();
  });
});

test('retentie: locaties 24u na einde weg, max 3 dagen', async () => {
  const { t, owner, friend, connect, startTrip, ping } = await setup();
  await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
  await owner.as.mutation(api.sessions.end, { sessionId: sid });
  await t.mutation(internal.monitor.purge, {});
  expect(await owner.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(1);
  await t.run((ctx) => ctx.db.patch(sid, { endedAt: Date.now() - 25 * 3600_000 }));
  await t.mutation(internal.monitor.purge, {});
  expect(await owner.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
});

test('admin ziet misbruikmeldingen, gewone gebruiker niet; audit log wordt geschreven', async () => {
  const { t, owner, friend, admin } = await setup();
  await owner.as.mutation(api.contacts.report, { userId: friend.id, reason: 'stalking' });
  expect(await admin.as.query(api.account.abuseReports, {})).toHaveLength(1);
  await expect(owner.as.query(api.account.abuseReports, {})).rejects.toThrow(/FORBIDDEN/);
  expect((await t.run((ctx) => ctx.db.query('auditLogs').collect())).some((a) => a.action === 'abuse.reported')).toBe(true);
});

test('account verwijderen wist alle gegevens incl. locaties', async () => {
  const { t, owner, friend, connect, startTrip, ping } = await setup();
  await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
  await expect(owner.as.mutation(api.account.deleteAccount, { confirm: 'nee' })).rejects.toThrow(/CONFIRMATION_REQUIRED/);
  await owner.as.mutation(api.account.deleteAccount, { confirm: 'VERWIJDER' });
  const left = await t.run(async (ctx) => ({
    user: await ctx.db.get(owner.id), locs: (await ctx.db.query('locations').collect()).length,
    sessions: (await ctx.db.query('sessions').collect()).length, contacts: (await ctx.db.query('trustedContacts').collect()).length,
  }));
  expect(left).toEqual({ user: null, locs: 0, sessions: 0, contacts: 0 });
  expect((await friend.as.query(api.contacts.list, {})).theirs).toHaveLength(0);
});

describe('meldingen en receipts', () => {
  test('reis gestart → kijkers; bijna aangekomen eenmalig; reis beëindigd na bevestiging', async () => {
    vi.useFakeTimers();
    const { t, owner, friend, connect } = await setup();
    await connect(owner, friend);
    await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[friend]' });
    const sid = await owner.as.mutation(api.sessions.start, { destination: 'Thuis', destLat: 52.37, destLng: 4.9, expectedArrival: Date.now() + 30 * MIN, viewerIds: [friend.id] });
    await owner.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.30, lng: 4.9, recordedAt: Date.now() }); // ver weg
    await owner.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.3690, lng: 4.9, recordedAt: Date.now() }); // ~110 m
    await owner.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.3695, lng: 4.9, recordedAt: Date.now() });
    await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 0 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const kinds = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).map((m) => m.kind);
    expect(kinds).toEqual(['trip_started', 'almost_arrived', 'trip_ended']);
    expect(sentBodies()).toContain('veilig te zijn aangekomen');
    const own = await owner.as.query(api.sessions.get, { sessionId: sid });
    expect(own!.notifications.every((x) => x.status === 'delivered')).toBe(true);
  });
  test('receipt met fout → mislukt; geen receipt → onbekend', async () => {
    vi.useFakeTimers();
    for (const [mode, expected] of [['error', 'failed'], ['missing', 'unknown']] as const) {
      receiptStatus = mode;
      const { t, owner, friend, connect } = await setup();
      await connect(owner, friend);
      await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[f]' });
      const alertId = await owner.as.mutation(api.sos.trigger, { clientRef: `r-${mode}` });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await owner.as.query(api.sos.get, { alertId }))!.deliveries[0].status).toBe(expected);
    }
  });
  test('check-in-herinnering wordt één keer verstuurd en na verlengen opnieuw', async () => {
    const { t, owner, friend, connect, startTrip } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id], 10);
    const due = async () => t.run(async (ctx) => { const c = (await ctx.db.query('checkIns').first())!; await ctx.db.patch(c._id, { dueAt: Date.now() - MIN }); });
    const reminders = () => t.run(async (ctx) => (await ctx.db.query('pushMessages').collect()).filter((m) => m.kind === 'check_in_required').length);
    await due(); await t.mutation(internal.monitor.checkDeadlines, {}); await t.mutation(internal.monitor.checkDeadlines, {});
    expect(await reminders()).toBe(1);
    await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 10 });
    await due(); await t.mutation(internal.monitor.checkDeadlines, {});
    expect(await reminders()).toBe(2);
  });
});
describe('bewegingsdetectie', () => {
  const now = 10_000_000; const p = (lat: number, ago: number) => ({ lat, lng: 5, recordedAt: now - ago * MIN });
  test('pure detectie', () => {
    expect(detectSignals({ locations: [p(52, 12)], now, sessionStart: now - 30 * MIN })).toEqual(['no_data']);
    expect(detectSignals({ locations: [], now, sessionStart: now - 5 * MIN })).toEqual([]);
    expect(detectSignals({ locations: [p(52, 20), p(52, 10), p(52.0001, 1)], now, sessionStart: now - 30 * MIN })).toEqual(['stationary']);
    expect(detectSignals({ locations: [p(52, 20), p(52.01, 10), p(52.02, 1)], now, sessionStart: now - 30 * MIN })).toEqual([]);
    // dichtbij bestemming stilstaan is geen signaal
    expect(detectSignals({ locations: [p(52, 20), p(52, 1)], now, sessionStart: 0, dest: { lat: 52.001, lng: 5 } })).toEqual([]);
    expect(detectSignals({ locations: [p(52.05, 2), p(52.0, 1)], now, sessionStart: 0, dest: { lat: 52.1, lng: 5 }, startDistanceM: 5_500 })).toEqual(['deviation']);
  });
  test('alleen premium + opt-in; alleen gebruiker krijgt extra check-in, contacten NIET', async () => {
    const { t, owner, friend, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    const age = () => t.run(async (ctx) => { for (const l of await ctx.db.query('locations').collect()) await ctx.db.patch(l._id, { recordedAt: Date.now() - 11 * MIN }); });
    await age();
    await expect(owner.as.mutation(api.profiles.update, { motionDetection: true })).rejects.toThrow(/PREMIUM_REQUIRED/);
    await t.mutation(internal.monitor.checkDeadlines, {});
    expect(await t.run((ctx) => ctx.db.query('motionSignals').collect())).toHaveLength(0);
    await t.run(async (ctx) => { const s = (await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', owner.id)).first())!; await ctx.db.patch(s._id, { tier: 'premium' }); });
    await owner.as.mutation(api.profiles.update, { motionDetection: true });
    await t.mutation(internal.monitor.checkDeadlines, {});
    await t.mutation(internal.monitor.checkDeadlines, {}); // cooldown: niet dubbel
    const sigs = await t.run((ctx) => ctx.db.query('motionSignals').collect());
    expect(sigs.map((x) => x.kind)).toEqual(['no_data']);
    const msgs = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).filter((m) => m.kind === 'motion_check');
    expect(msgs.map((m) => m.recipientId)).toEqual([owner.id]);
    expect((await t.run((ctx) => ctx.db.query('alerts').collect()))).toHaveLength(0); // nooit automatisch noodgeval
    expect((await owner.as.query(api.sessions.get, { sessionId: sid }))!.signals).toHaveLength(1);
    await owner.as.mutation(api.motion.acknowledge, { signalId: sigs[0]._id });
    expect((await owner.as.query(api.sessions.get, { sessionId: sid }))!.signals).toHaveLength(0);
    await expect(friend.as.mutation(api.motion.acknowledge, { signalId: sigs[0]._id })).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('premium / RevenueCat', () => {
  const ev = (userId: string, type: string, id: string, extra = {}) => ({ event: { id, type, app_user_id: userId, entitlement_ids: ['premium'], expiration_at_ms: Date.now() + 30 * 24 * 3600_000, ...extra } });
  const post = (t: Awaited<ReturnType<typeof setup>>['t'], body: unknown, auth?: string) =>
    t.fetch('/revenuecat/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
  beforeEach(() => { process.env.REVENUECAT_WEBHOOK_SECRET = 'test-secret'; });
  afterEach(() => { delete process.env.REVENUECAT_WEBHOOK_SECRET; });
  test('webhook weigert zonder/onjuist geheim', async () => {
    const { t, owner } = await setup();
    expect((await post(t, ev(owner.id, 'INITIAL_PURCHASE', 'e1'))).status).toBe(401);
    expect((await post(t, ev(owner.id, 'INITIAL_PURCHASE', 'e1'), 'Bearer fout')).status).toBe(401);
    expect((await owner.as.query(api.billing.status, {}))!.premium).toBe(false);
  });
  test('aankoop → premium, idempotent, verlopen → gratis; onbekende gebruiker genegeerd', async () => {
    const { t, owner } = await setup();
    expect((await post(t, ev(owner.id, 'INITIAL_PURCHASE', 'e1'), 'Bearer test-secret')).status).toBe(200);
    expect((await owner.as.query(api.billing.status, {}))!.premium).toBe(true);
    expect(await (await post(t, ev(owner.id, 'INITIAL_PURCHASE', 'e1'), 'test-secret')).json()).toEqual({ result: 'duplicate' });
    await post(t, ev(owner.id, 'CANCELLATION', 'e2'), 'Bearer test-secret');
    expect((await owner.as.query(api.billing.status, {}))!.premium).toBe(true); // tot einde periode
    await post(t, ev(owner.id, 'EXPIRATION', 'e3'), 'Bearer test-secret');
    expect((await owner.as.query(api.billing.status, {}))!.premium).toBe(false);
    expect(await (await post(t, ev('geen-user', 'INITIAL_PURCHASE', 'e4'), 'Bearer test-secret')).json()).toEqual({ result: 'unknown_user' });
  });
  test('feature gating: aanpasbare check-ins en respijt alleen premium; geschiedenis 7 vs 90 dagen', async () => {
    const { t, owner, friend, connect, startTrip } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]);
    await expect(owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 15 })).rejects.toThrow(/PREMIUM_REQUIRED/);
    await expect(owner.as.mutation(api.profiles.update, { defaultGraceMinutes: 10 })).rejects.toThrow(/PREMIUM_REQUIRED/);
    await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 10 }); // basis blijft gratis
    expect((await owner.as.query(api.sessions.history, {}))!.days).toBe(7);
    await post(t, ev(owner.id, 'INITIAL_PURCHASE', 'p1'), 'Bearer test-secret');
    await owner.as.mutation(api.sessions.respondCheckIn, { sessionId: sid, extendMinutes: 15 });
    await owner.as.mutation(api.profiles.update, { defaultGraceMinutes: 10 });
    expect((await owner.as.query(api.sessions.history, {}))!.days).toBe(90);
  });
  test('SOS blijft gratis en werkt ook voor beperkte accounts', async () => {
    const { t, owner, friend, connect } = await setup();
    await connect(owner, friend);
    await t.run(async (ctx) => { const p = (await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', owner.id)).first())!; await ctx.db.patch(p._id, { restricted: true }); });
    await expect(owner.as.mutation(api.sessions.start, { destination: 'X', expectedArrival: Date.now() + 30 * MIN, viewerIds: [friend.id] })).rejects.toThrow(/RESTRICTED/);
    await expect(owner.as.mutation(api.contacts.createInvitation, {})).rejects.toThrow(/RESTRICTED/);
    expect(await owner.as.mutation(api.sos.trigger, { clientRef: 'restricted-sos' })).toBeTruthy();
  });
});

describe('AI-assistent', () => {
  beforeEach(() => { delete process.env.OPENAI_API_KEY; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });
  const msg = (content: string) => ({ messages: [{ role: 'user' as const, content }] });
  const makePremium = (t: Awaited<ReturnType<typeof setup>>['t'], id: Id<'users'>) => t.run(async (ctx) => { const s = (await ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', id)).first())!; await ctx.db.patch(s._id, { tier: 'premium' }); });
  test('zonder OPENAI_API_KEY netjes uitgeschakeld', async () => {
    const { owner } = await setup();
    expect(await owner.as.action(api.assistant.ask, msg('tips?'))).toEqual({ disabled: true });
    expect((await owner.as.query(api.assistant.availability, {})).enabled).toBe(false);
  });
  test('alleen premium; systeemprompt verbiedt noodvaststelling; gevaar → vaste 112-tekst', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const { t, owner } = await setup();
    await expect(owner.as.action(api.assistant.ask, msg('tips?'))).rejects.toThrow(/PREMIUM_REQUIRED/);
    await makePremium(t, owner.id);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Deel je reis met een vertrouwd contact.' } }] }), { status: 200 }));
    const r = await owner.as.action(api.assistant.ask, msg('Ik word gevolgd, wat moet ik doen?'));
    expect(r.reply).toMatch(/vertrouwd contact/);
    expect(r.notice).toMatch(/112/);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[0].content).toMatch(/nooit vast of er een noodsituatie is/);
    expect((await t.run((ctx) => ctx.db.query('alerts').collect()))).toHaveLength(0); // AI alarmeert niemand
  });
  test('OpenAI-fout → nette melding', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const { t, owner } = await setup(); await makePremium(t, owner.id);
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }));
    expect((await owner.as.action(api.assistant.ask, msg('hoi'))).reply).toMatch(/niet bereikbaar/);
  });
});

describe('adminpaneel', () => {
  test('alleen admins; geen locatiegegevens in admin-output', async () => {
    const { owner, friend, admin, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid, 52.123456);
    for (const fn of [api.admin.users, api.admin.reports, api.admin.stats, api.admin.errors, api.admin.subscriptions, api.admin.auditLog])
      await expect(owner.as.query(fn, {})).rejects.toThrow(/FORBIDDEN/);
    const dump = JSON.stringify(await Promise.all([api.admin.users, api.admin.reports, api.admin.stats, api.admin.errors, api.admin.subscriptions, api.admin.auditLog].map((fn) => admin.as.query(fn, {}))));
    expect(dump).not.toMatch(/52\.123456|Thuis|lat|lng/);
    expect((await admin.as.query(api.admin.stats, {})).users).toBe(6);
    expect(await admin.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
  });
  test('account beperken trekt meekijktoegang direct in; SOS blijft', async () => {
    const { owner, friend, admin, connect, startTrip, ping } = await setup();
    await connect(owner, friend); const sid = await startTrip([friend.id]); await ping(sid);
    await expect(owner.as.mutation(api.admin.setRestricted, { userId: friend.id, restricted: true })).rejects.toThrow(/FORBIDDEN/);
    await admin.as.mutation(api.admin.setRestricted, { userId: friend.id, restricted: true, reason: 'melding' });
    expect(await friend.as.query(api.sessions.locations, { sessionId: sid })).toHaveLength(0);
    expect(await friend.as.mutation(api.sos.trigger, { clientRef: 'f-sos' })).toBeTruthy();
  });
  test('meldingstatus aanpassen en grantAdmin via CLI', async () => {
    const { t, owner, friend, admin } = await setup();
    await owner.as.mutation(api.contacts.report, { userId: friend.id, reason: 'harassment' });
    const [r] = await admin.as.query(api.admin.reports, {});
    expect(r.reportedName).toBe('friend');
    await admin.as.mutation(api.admin.setReportStatus, { reportId: r._id, status: 'closed' });
    expect((await admin.as.query(api.admin.stats, {})).openReports).toBe(0);
    await t.mutation(internal.admin.grantAdmin, { email: 'owner@test.nl' });
    expect(await owner.as.query(api.admin.amIAdmin, {})).toBe(true);
  });
});

test('geblokkeerde personen tonen en deblokkeren herstelt geen relatie', async () => {
  const { owner, friend, connect } = await setup();
  await connect(owner, friend);
  await friend.as.mutation(api.contacts.block, { userId: owner.id });
  expect((await friend.as.query(api.contacts.blocked, {})).map((b) => b.name)).toEqual(['owner']);
  await friend.as.mutation(api.contacts.unblock, { userId: owner.id });
  expect(await friend.as.query(api.contacts.blocked, {})).toHaveLength(0);
  expect((await owner.as.query(api.contacts.list, {})).mine).toHaveLength(0);
});
describe('Google OAuth', () => {
  afterEach(() => { delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET; });
  test('redirect alleen naar app-scheme, Expo-dev of SITE_URL', () => {
    expect(isAllowedRedirect('safewalk://', 'https://x.app')).toBe(true);
    expect(isAllowedRedirect('safewalk://auth?x=1', '')).toBe(true);
    expect(isAllowedRedirect('exp://192.168.1.5:8081/--/', '')).toBe(true);
    expect(isAllowedRedirect('https://x.app/login', 'https://x.app')).toBe(true);
    expect(isAllowedRedirect('https://evil.example', 'https://x.app')).toBe(false);
    expect(isAllowedRedirect('https://x.app.evil.example', 'https://x.app')).toBe(false);
  });
  test('providers-query meldt of Google is geconfigureerd', async () => {
    const t = convexTest(schema, modules);
    delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET;
    delete process.env.RESEND_API_KEY; delete process.env.AUTH_EMAIL_DEV_LOG;
    expect(await t.query(api.auth.providers, {})).toEqual({ google: false, email: false, emailDelivery: false, emailDevLog: false });
    process.env.AUTH_GOOGLE_ID = 'id'; process.env.AUTH_GOOGLE_SECRET = 'secret';
    expect(await t.query(api.auth.providers, {})).toEqual({ google: true, email: false, emailDelivery: false, emailDevLog: false });
    delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET;
  });
  test('OAuth-gebruiker krijgt profiel + gratis abonnement (idempotent)', async () => {
    const t = convexTest(schema, modules);
    const counts = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Google Gebruiker', email: 'g@gmail.com' });
      await ensureProfile(ctx, userId, 'Google Gebruiker'); await ensureProfile(ctx, userId, 'Google Gebruiker');
      return { p: (await ctx.db.query('profiles').collect()), s: (await ctx.db.query('subscriptions').collect()) };
    });
    expect(counts.p).toHaveLength(1); expect(counts.p[0].displayName).toBe('Google Gebruiker');
    expect(counts.s.map((x) => x.tier)).toEqual(['free']);
  });
});
