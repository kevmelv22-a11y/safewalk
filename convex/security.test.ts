/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', { userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5, onboardingDone: true, restricted: false });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

describe('veiligheids-PIN', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test('setPin hasht PIN; me/pinStatus lekken geen hash', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '123456', confirmPin: '123456' });
    const st = await a.as.query(api.security.pinStatus, {});
    expect(st?.pinSet).toBe(true);
    const me = await a.as.query(api.profiles.me, {});
    expect(me?.pinSet).toBe(true);
    expect((me as { pinHash?: string }).pinHash).toBeUndefined();
    const raw = await t.run(async (ctx) => ctx.db.query('profiles').collect());
    expect(raw[0].pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw[0].pinSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(raw[0].pinHash).not.toContain('123456');
  });

  test('verkeerde PIN: generieke fout + stil alarm naar contacten met verse locatie', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const token = await a.as.mutation(api.contacts.createInvitation, {});
    await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    await a.as.mutation(api.security.setPin, { pin: '654321', confirmPin: '654321' });
    const now = Date.now();
    const wrong = await a.as.mutation(api.security.verifyPin, {
      pin: '000000', purpose: 'unlock_danger',
      locationConsent: true, lat: 52.37, lng: 4.89, accuracyM: 10, locationAt: now,
    });
    expect(wrong).toEqual({ ok: false, reason: 'wrong' });
    const alerts = await t.run((ctx) => ctx.db.query('alerts').collect());
    expect(alerts.some((x) => x.kind === 'wrong_pin' && x.lat === 52.37)).toBe(true);
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    const wp = pushes.find((p) => p.kind === 'wrong_pin' && p.recipientId === b.id);
    expect(wp).toBeTruthy();
    expect(wp!.body.startsWith('Er is een melding verstuurd met een fout wachtwoord.')).toBe(true);
    expect(wp!.body).not.toMatch(/654321|pinHash|salt/i);
  });

  test('juiste PIN unlockt incident; client succes alleen na server ok', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '112233', confirmPin: '112233' });
    await a.as.mutation(api.security.setTorchOptIn, { optIn: true });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'c1', locationConsent: false, torchRequested: true,
    });
    expect(started.incidentId).toBeTruthy();
    const bad = await a.as.mutation(api.security.verifyPin, { pin: '999999', purpose: 'unlock_danger', incidentId: started.incidentId! });
    expect(bad.ok).toBe(false);
    const ok = await a.as.mutation(api.security.verifyPin, { pin: '112233', purpose: 'unlock_danger', incidentId: started.incidentId! });
    expect(ok).toEqual({ ok: true });
    const inc = await a.as.query(api.incidents.active, {});
    expect(inc).toBeNull();
  });

  test('te korte PIN geweigerd; mismatched confirm geweigerd', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await expect(a.as.mutation(api.security.setPin, { pin: '12', confirmPin: '12' })).rejects.toThrow(/PIN_INVALID/);
    await expect(a.as.mutation(api.security.setPin, { pin: '1234', confirmPin: '1235' })).rejects.toThrow(/PIN_INVALID/);
  });
});
