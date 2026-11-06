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

describe('PIN adversarial', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  test('bestaande PIN overschrijven zonder currentPin faalt', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '111111', confirmPin: '111111' });
    await expect(a.as.mutation(api.security.setPin, { pin: '222222', confirmPin: '222222' })).rejects.toThrow(/PIN_REQUIRED/);
    await expect(a.as.mutation(api.security.setPin, { pin: '222222', confirmPin: '222222', currentPin: '000000' })).rejects.toThrow(/PIN_WRONG/);
    await a.as.mutation(api.security.setPin, { pin: '222222', confirmPin: '222222', currentPin: '111111' });
    const ok = await a.as.mutation(api.security.verifyPin, { pin: '222222', purpose: 'change_pin' });
    expect(ok.ok).toBe(true);
  });

  test('arrived_safe en unlock vereisen server-ok; foute PIN lost incident niet op', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '333333', confirmPin: '333333' });
    const started = await a.as.mutation(api.incidents.startUnsafe, { clientRef: 'x1', locationConsent: false, torchRequested: false });
    const bad = await a.as.mutation(api.security.verifyPin, { pin: '000000', purpose: 'unlock_danger', incidentId: started.incidentId! });
    expect(bad.ok).toBe(false);
    expect(await a.as.query(api.incidents.active, {})).not.toBeNull();
    // zonder incidentId maar juiste PIN: toch alles clearen
    const ok = await a.as.mutation(api.security.verifyPin, { pin: '333333', purpose: 'unlock_danger' });
    expect(ok.ok).toBe(true);
    expect(await a.as.query(api.incidents.active, {})).toBeNull();
  });

  test('wrong-PIN push body begint met exacte NL-zin; geen hash-lek', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const token = await a.as.mutation(api.contacts.createInvitation, {});
    await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    await a.as.mutation(api.security.setPin, { pin: '444444', confirmPin: '444444' });
    await a.as.mutation(api.security.verifyPin, {
      pin: '999999', purpose: 'arrived_safe',
      locationConsent: true, lat: 52.1, lng: 5.1, locationAt: Date.now(),
    });
    const pushes = await t.run((ctx) => ctx.db.query('pushMessages').collect());
    const wp = pushes.find((p) => p.kind === 'wrong_pin')!;
    expect(wp.body.startsWith('Er is een melding verstuurd met een fout wachtwoord.')).toBe(true);
    expect(wp.body).not.toMatch(/444444|pinHash|salt/i);
    const me = await a.as.query(api.profiles.me, {});
    expect((me as { pinHash?: string }).pinHash).toBeUndefined();
  });

  test('unauthenticated setPin/verifyPin faalt (geen open PBKDF2)', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.security.setPin, { pin: '123456', confirmPin: '123456' })).rejects.toThrow();
    await expect(t.mutation(api.security.verifyPin, { pin: '123456', purpose: 'arrived_safe' })).rejects.toThrow();
  });
});

describe('tracking links', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  test('token niet in DB; revoke + expiry', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const link = await a.as.mutation(api.tracking.createShareLink, { label: 'Test' });
    expect(link.token).toMatch(/^[0-9a-f]{64}$/);
    const rows = await t.run((ctx) => ctx.db.query('shareLinks').collect());
    expect(rows.some((r) => (r as { token?: string }).token === link.token)).toBe(false);
    expect(rows[0].tokenHash).not.toBe(link.token);
    const resolved = await t.run(async (ctx) => {
      const { sha256Hex } = await import('./lib');
      const h = await sha256Hex(link.token);
      return ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', h)).first();
    });
    expect(resolved).toBeTruthy();
    await a.as.mutation(api.tracking.revokeShareLink, { id: link.id });
    const after = await t.run(async (ctx) => ctx.db.get(link.id));
    expect(after?.revokedAt).toBeTypeOf('number');
  });
});

describe('deviceContacts normalize', () => {
  test('NL 06 → +31', async () => {
    const { normalizePhone } = await import('./deviceContacts');
    expect(normalizePhone('06 12345678')).toBe('+31612345678');
    expect(normalizePhone('12')).toBeNull();
  });
});
