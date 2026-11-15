/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string, birth: { year: number; month: number }) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', {
      userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5,
      onboardingDone: true, restricted: false, birthYear: birth.year, birthMonth: birth.month,
    });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

describe('kindermodus en offline punten', () => {
  test('zonder toestemming geen code; kind zonder koppeling geen SOS; na koppeling wel, naar ouder', async () => {
    const t = convexTest(schema, modules);
    const parent = await user(t, 'ouder', { year: 1990, month: 1 });
    const teen = await user(t, 'tiener', { year: 2012, month: 6 });
    const otherAdult = await user(t, 'ander', { year: 1991, month: 2 });
    const otherTeen = await user(t, 'tiener2', { year: 2012, month: 7 });

    await expect(parent.as.mutation(api.childLinks.createInvite, { consentAccepted: false })).rejects.toThrow(/CONSENT_REQUIRED/);
    const inv = await parent.as.mutation(api.childLinks.createInvite, { consentAccepted: true });
    expect(inv.code).toMatch(/^[A-Z0-9]{8}$/);
    const stored = await t.run((ctx) => ctx.db.query('childLinks').collect());
    expect(stored[0]?.inviteHash).not.toBe(inv.code);

    await expect(teen.as.mutation(api.sos.trigger, { clientRef: 'voor' })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
    await expect(parent.as.mutation(api.childLinks.acceptInvite, { code: inv.code })).rejects.toThrow(/CHILD_MUST_BE_MINOR/);
    await teen.as.mutation(api.childLinks.acceptInvite, { code: inv.code });
    await expect(otherAdult.as.mutation(api.childLinks.acceptInvite, { code: inv.code })).rejects.toThrow(/CHILD_MUST_BE_MINOR/);
    await expect(otherTeen.as.mutation(api.childLinks.acceptInvite, { code: inv.code })).rejects.toThrow(/INVITE_INVALID/);

    const alertId = await teen.as.mutation(api.sos.trigger, { clientRef: 'na-koppel', lat: 52.1, lng: 4.9 });
    const pushes = await t.run(async (ctx) => ctx.db.query('pushMessages').collect());
    expect(pushes.some((p) => p.kind === 'sos' && p.recipientId === parent.id && p.alertId === alertId)).toBe(true);
  });

  test('addLocations is idempotent via clientId en sluit gesloten sessies af', async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, 'reiziger', { year: 1990, month: 1 });
    const friend = await user(t, 'vriend', { year: 1990, month: 2 });
    const token = await owner.as.mutation(api.contacts.createInvitation, {});
    await friend.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    const sid = await owner.as.mutation(api.sessions.start, {
      destination: 'Thuis', expectedArrival: Date.now() + 30 * 60_000, viewerIds: [friend.id],
    });
    const point = { sessionId: sid, clientId: `${sid}:111`, lat: 52.1, lng: 5.1, recordedAt: Date.now(), accuracyM: 10 };
    const a = await owner.as.mutation(api.sessions.addLocations, { points: [point] });
    const b = await owner.as.mutation(api.sessions.addLocations, { points: [point] });
    expect(a.results[0].status).toBe('ok');
    expect(b.results[0].status).toBe('duplicate');
    const n = await t.run(async (ctx) => (await ctx.db.query('locations').collect()).filter((l) => l.sessionId === sid).length);
    expect(n).toBe(1);
  });

  test('geofence meldt ouder bij verlaten na een eerste punt binnen de zone', async () => {
    const t = convexTest(schema, modules);
    const parent = await user(t, 'ouder2', { year: 1988, month: 3 });
    const teen = await user(t, 'kind2', { year: 2012, month: 1 });
    const inv = await parent.as.mutation(api.childLinks.createInvite, { consentAccepted: true });
    await teen.as.mutation(api.childLinks.acceptInvite, { code: inv.code });
    const links = await parent.as.query(api.childLinks.listForParent, {});
    const linkId = links.find((l) => l.status === 'active')!.linkId;
    await parent.as.mutation(api.childLinks.setGeofence, { linkId, kind: 'home', lat: 52.37, lng: 4.89, radiusM: 150 });
    const sid = await teen.as.mutation(api.childLinks.startShare, {});
    await teen.as.mutation(api.sessions.addLocation, { sessionId: sid, clientId: 'p1', lat: 52.3701, lng: 4.8901, recordedAt: Date.now() });
    let geo = await t.run(async (ctx) => ctx.db.query('alerts').collect());
    expect(geo.some((a) => a.kind === 'geofence_leave' || a.kind === 'geofence_enter')).toBe(false);
    await teen.as.mutation(api.sessions.addLocation, { sessionId: sid, clientId: 'p2', lat: 52.5, lng: 5.1, recordedAt: Date.now() });
    geo = await t.run(async (ctx) => ctx.db.query('alerts').collect());
    expect(geo.some((a) => a.kind === 'geofence_leave' && a.userId === teen.id)).toBe(true);
    const push = await t.run(async (ctx) => ctx.db.query('pushMessages').collect());
    expect(push.some((p) => p.kind === 'geofence_leave' && p.recipientId === parent.id)).toBe(true);
  });

  test('account wissen verwijdert de koppeling', async () => {
    const t = convexTest(schema, modules);
    const parent = await user(t, 'ouder3', { year: 1990, month: 1 });
    const teen = await user(t, 'kind3', { year: 2012, month: 6 });
    const inv = await parent.as.mutation(api.childLinks.createInvite, { consentAccepted: true });
    await teen.as.mutation(api.childLinks.acceptInvite, { code: inv.code });
    await teen.as.mutation(api.account.deleteAccount, { confirm: 'VERWIJDER' });
    const left = await t.run(async (ctx) => ctx.db.query('childLinks').collect());
    expect(left).toHaveLength(0);
  });
});
