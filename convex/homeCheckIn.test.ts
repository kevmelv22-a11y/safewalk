/// <reference types="vite/client" />
// Thuis-check-in. Fetch is gemockt: er gaat geen push, sms of e-mail de deur uit.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob('./**/*.ts');
const MIN = 60_000;

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
  const owner = await mk('owner');
  const friend = await mk('friend');
  const stranger = await mk('stranger');
  const minor = await mk('minor', new Date().getUTCFullYear() - 14);
  const connect = async () => {
    const token = await owner.as.mutation(api.contacts.createInvitation, {});
    await friend.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    await t.run(async (ctx) => { for (const g of await ctx.db.query('premiumGrants').collect()) await ctx.db.delete(g._id); });
  };
  const start = (extra: { dueAt?: number; lat?: number; lng?: number; locationAt?: number; viewerIds?: Id<'users'>[]; label?: string } = {}) =>
    owner.as.mutation(api.homeCheckIn.start, {
      label: extra.label ?? 'Thuis',
      dueAt: extra.dueAt ?? Date.now() + 30 * MIN,
      viewerIds: extra.viewerIds ?? [friend.id],
      ...(extra.lat !== undefined ? { lat: extra.lat, lng: extra.lng ?? 4.89, accuracyM: 12, locationAt: extra.locationAt ?? Date.now() } : {}),
    });
  return { t, owner, friend, stranger, minor, connect, start };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  let n = 0;
  fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    const u = String(url);
    if (!u.startsWith('https://exp.host/')) throw new Error(`geblokkeerde fetch in test: ${u}`);
    if (u.endsWith('/getReceipts')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    const body = JSON.parse(init?.body ?? '[]') as unknown[];
    const list = Array.isArray(body) ? body : [];
    return new Response(JSON.stringify({ data: list.map(() => ({ status: 'ok', id: `ticket-test-${++n}` })) }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Wacht push-acties af die meteen gepland zijn. Toekomstige check-in-jobs blijven liggen. */
async function drain(t: { finishAllScheduledFunctions: (advance: () => void) => Promise<void> }) {
  await t.finishAllScheduledFunctions(() => undefined);
}
function assertNoRealSend() {
  for (const call of fetchMock.mock.calls) {
    expect(String(call[0])).toContain('https://exp.host/');
    expect(String(call[1]?.body ?? '')).not.toMatch(/resend\.com|twilio|sms/i);
  }
}

describe('thuis-check-in', () => {
  test('verleden, te ver vooruit, zonder contact en een vreemde worden geweigerd', async () => {
    const { owner, friend, stranger, connect } = await setup();
    await connect();
    await expect(owner.as.mutation(api.homeCheckIn.start, { label: 'Thuis', dueAt: Date.now() - 1000, viewerIds: [friend.id] })).rejects.toThrow(/INVALID_DUE/);
    await expect(owner.as.mutation(api.homeCheckIn.start, { label: 'Thuis', dueAt: Date.now() + 19 * 3600_000, viewerIds: [friend.id] })).rejects.toThrow(/INVALID_DUE/);
    await expect(owner.as.mutation(api.homeCheckIn.start, { label: 'Thuis', dueAt: Date.now() + 30 * MIN, viewerIds: [] })).rejects.toThrow(/NO_VIEWERS/);
    await expect(owner.as.mutation(api.homeCheckIn.start, { label: 'Thuis', dueAt: Date.now() + 30 * MIN, viewerIds: [stranger.id] })).rejects.toThrow(/VIEWER_NOT_TRUSTED/);
    await expect(owner.as.mutation(api.homeCheckIn.start, { label: ' ', dueAt: Date.now() + 30 * MIN, viewerIds: [friend.id] })).rejects.toThrow(/INVALID_LABEL/);
  });

  test('een minderjarige kan geen thuis-check-in starten', async () => {
    const { minor, friend } = await setup();
    await expect(minor.as.mutation(api.homeCheckIn.start, { label: 'Thuis', dueAt: Date.now() + 30 * MIN, viewerIds: [friend.id] })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
  });

  test('meerdere timers tot 3, daarna niet; annuleren maakt weer plek', async () => {
    const { t, owner, connect, start } = await setup();
    await connect();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await start({ dueAt: Date.now() + (20 + i) * MIN }));
    await expect(start()).rejects.toThrow(/TOO_MANY_CHECKINS/);
    await owner.as.mutation(api.homeCheckIn.cancel, { id: ids[0] });
    const again = await start();
    const mine = await owner.as.query(api.homeCheckIn.mine, {});
    expect(mine.pending.map((p) => p._id).sort()).toEqual([ids[1], ids[2], again].sort());
    expect(mine.recent.map((p) => p._id)).toContain(ids[0]);
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pushes.filter((m) => m.kind === 'missed_check_in')).toHaveLength(0);
    await drain(t);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('annuleren stuurt niets, ook niet als de tijd daarna verstrijkt', async () => {
    const { t, owner, connect, start } = await setup();
    await connect();
    const id = await start();
    await owner.as.mutation(api.homeCheckIn.cancel, { id });
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pushes).toHaveLength(0);
    await drain(t);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('eerst een herinnering aan jezelf, binnen de respijt nog niets naar contacten', async () => {
    const { t, owner, friend, connect, start } = await setup();
    await connect();
    const id = await start();
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 30_000 }); });
    await t.mutation(internal.homeCheckIn.remind, { id, generation: 1 });
    await t.mutation(internal.homeCheckIn.escalate, { id, generation: 1 });
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pushes.every((m) => m.recipientId === owner.id)).toBe(true);
    expect(pushes.some((m) => m.kind === 'check_in_required')).toBe(true);
    expect(pushes.some((m) => m.kind === 'missed_check_in')).toBe(false);
    expect(pushes.some((m) => m.recipientId === friend.id)).toBe(false);
    await t.mutation(internal.homeCheckIn.remind, { id, generation: 1 });
    const again = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(again.filter((m) => m.kind === 'check_in_required')).toHaveLength(1);
    await drain(t);
    assertNoRealSend();
  });

  test('na de respijt krijgen contacten de laatst bekende locatie, een tweede keer niet', async () => {
    const { t, owner, friend, connect, start } = await setup();
    await connect();
    await friend.as.mutation(api.profiles.registerPushToken, { token: 'ExponentPushToken[test-friend]' });
    const id = await start({ lat: 52.37, lng: 4.89 });
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 3 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    await t.mutation(internal.monitor.checkDeadlines, {});
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    const missed = pushes.filter((m) => m.kind === 'missed_check_in');
    expect(missed).toHaveLength(1);
    expect(missed[0].recipientId).toBe(friend.id);
    expect(missed[0].body).toContain('https://maps.google.com/?q=52.37,4.89');
    expect(missed[0].body.toLowerCase()).not.toContain('gegarandeerd');
    expect(missed[0].status).toBe('queued');
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect()))[0];
    expect(alert.kind).toBe('missed_check_in');
    expect(alert.lat).toBe(52.37);
    expect(alert.clientRef).toBe(`home-${id}`);
    const own = pushes.filter((m) => m.recipientId === owner.id);
    expect(own.some((m) => m.body.includes('gewars') || m.body.includes('gewaarschuwd'))).toBe(true);
    await drain(t);
    assertNoRealSend();
    expect(fetchMock).toHaveBeenCalled();
  });

  test('zonder locatie zegt de melding eerlijk dat de plek onbekend is', async () => {
    const { t, connect, start } = await setup();
    await connect();
    const id = await start();
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 3 * MIN }); });
    await t.mutation(internal.homeCheckIn.escalate, { id, generation: 1 });
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect()))[0];
    expect(alert.lat).toBeUndefined();
    const missed = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).find((m) => m.kind === 'missed_check_in')!;
    expect(missed.body).toMatch(/onbekend/);
    await drain(t);
    assertNoRealSend();
  });

  test('locatie van een lopende reis telt als laatst bekende als de check-in zelf geen punt heeft', async () => {
    const { t, owner, friend, connect, start } = await setup();
    await connect();
    const sid = await owner.as.mutation(api.sessions.start, { destination: 'Thuis', expectedArrival: Date.now() + 40 * MIN, viewerIds: [friend.id] });
    await owner.as.mutation(api.sessions.addLocation, { sessionId: sid, lat: 52.01, lng: 4.01, accuracyM: 8, recordedAt: Date.now() });
    const id = await start();
    const session = await owner.as.query(api.sessions.get, { sessionId: sid });
    expect(session!.session.endedAt).toBeUndefined();
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 3 * MIN }); });
    await t.mutation(internal.homeCheckIn.escalate, { id, generation: 1 });
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect())).find((a) => a.clientRef === `home-${id}`)!;
    expect(alert.lat).toBe(52.01);
    await drain(t);
    assertNoRealSend();
  });

  test('bevestigen stuurt geen gemiste check-in; een contact hoort dat je aangeeft thuis te zijn', async () => {
    const { t, owner, friend, connect, start } = await setup();
    await connect();
    const id = await start({ lat: 52.1, lng: 5.1 });
    await owner.as.mutation(api.homeCheckIn.confirm, { id });
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 10 * MIN }); });
    await t.mutation(internal.monitor.checkDeadlines, {});
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    expect(pushes.some((m) => m.kind === 'missed_check_in')).toBe(false);
    const home = pushes.find((m) => m.kind === 'home_checked_in')!;
    expect(home.recipientId).toBe(friend.id);
    expect(home.body).toMatch(/aangegeven thuis/);
    expect(home.body.toLowerCase()).not.toContain('gegarandeerd');
    expect((await owner.as.query(api.homeCheckIn.get, { id }))!.status).toBe('confirmed');
    expect(await friend.as.query(api.homeCheckIn.get, { id })).toBeNull();
    await expect(friend.as.mutation(api.homeCheckIn.confirm, { id })).rejects.toThrow(/CHECKIN_NOT_FOUND/);
    await drain(t);
    assertNoRealSend();
  });

  test('verlengen schuift de deadline; een oude generatie escaleert niet', async () => {
    const { t, owner, connect, start } = await setup();
    await connect();
    const id = await start({ dueAt: Date.now() + 10 * MIN });
    const before = (await owner.as.query(api.homeCheckIn.get, { id }))!.dueAt;
    const next = await owner.as.mutation(api.homeCheckIn.extend, { id, minutes: 10 });
    expect(next).toBeGreaterThan(before);
    await t.mutation(internal.homeCheckIn.escalate, { id, generation: 1 });
    expect((await owner.as.query(api.homeCheckIn.get, { id }))!.status).toBe('pending');
    await expect(owner.as.mutation(api.homeCheckIn.extend, { id, minutes: 15 })).rejects.toThrow(/INVALID_EXTEND/);
    for (let i = 0; i < 2; i++) await owner.as.mutation(api.homeCheckIn.extend, { id, minutes: 10 });
    await expect(owner.as.mutation(api.homeCheckIn.extend, { id, minutes: 10 })).rejects.toThrow(/EXTENSION_NOT_ALLOWED/);
    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row!.extensions).toBe(3);
    expect(row!.generation).toBe(4);
    await drain(t);
    assertNoRealSend();
  });

  test('geplande serverfuncties staan klaar en een herstart ziet de check-in nog', async () => {
    const { t, owner, connect, start } = await setup();
    await connect();
    const dueAt = Date.now() + 30 * MIN;
    const id = await start({ dueAt });
    const jobs = await t.run(async (ctx) => ctx.db.system.query('_scheduled_functions').collect());
    const text = JSON.stringify(jobs);
    expect(text).toContain('remind');
    expect(text).toContain('escalate');
    const mine = await owner.as.query(api.homeCheckIn.mine, {});
    expect(mine.pending.map((p) => p._id)).toContain(id);
    expect(mine.pending[0].locationKnown).toBe(false);
    await owner.as.mutation(api.homeCheckIn.updateLocation, { lat: 51.5, lng: 5.5, locationAt: Date.now() });
    expect((await owner.as.query(api.homeCheckIn.get, { id }))!.locationKnown).toBe(true);
    await expect(owner.as.mutation(api.homeCheckIn.updateLocation, { lat: 999, lng: 0, locationAt: Date.now() })).rejects.toThrow(/INVALID_LOCATION/);
    await drain(t);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('alsnog thuis melden na een gemiste check-in lost de melding op', async () => {
    const { t, owner, connect, start } = await setup();
    await connect();
    const id = await start({ lat: 52.2, lng: 4.2 });
    await t.run(async (ctx) => { await ctx.db.patch(id, { dueAt: Date.now() - 3 * MIN }); });
    await t.mutation(internal.homeCheckIn.escalate, { id, generation: 1 });
    await owner.as.mutation(api.homeCheckIn.confirm, { id });
    const alert = (await t.run((ctx) => ctx.db.query('alerts').collect()))[0];
    expect(alert.status).toBe('resolved');
    const late = (await t.run((ctx) => ctx.db.query('pushMessages').collect())).find((m) => m.kind === 'home_checked_in')!;
    expect(late.body).toMatch(/ná de eerdere/);
    await expect(owner.as.mutation(api.homeCheckIn.cancel, { id })).rejects.toThrow(/CHECKIN_CLOSED/);
    await drain(t);
    assertNoRealSend();
  });
});
