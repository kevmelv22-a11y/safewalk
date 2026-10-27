/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string) => {
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
      await ctx.db.insert('profiles', { userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: true, restricted: false });
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
beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init: { body: string }) => new Response(JSON.stringify({ data: JSON.parse(init.body).map(() => ({ status: 'ok' })) }), { status: 200 }));
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
    const { owner, stranger, startTrip } = await setup();
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toContain('52.3,4.9');
    const res = (await owner.as.query(api.sos.get, { alertId }))!;
    const byName = Object.fromEntries(res.deliveries.map((d) => [d.name, d.status]));
    expect(byName).toEqual({ friend: 'sent', c3: 'no_token' });
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
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 + 3 retries
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
    expect(fetchMock.mock.calls[0][1].body).toContain('niet op tijd');
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
