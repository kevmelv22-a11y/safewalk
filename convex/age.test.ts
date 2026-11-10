/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { ageInYears, ageStatus, isEarlierBirth } from './age';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string, birth?: { year: number; month: number }) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', {
      userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5,
      onboardingDone: true, restricted: false, ...birth && { birthYear: birth.year, birthMonth: birth.month },
    });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

describe('leeftijd', () => {
  test('jaar+maand, geen dag', () => {
    expect(ageInYears(2010, 12, Date.UTC(2026, 10, 9))).toBe(15);
    expect(ageInYears(2010, 11, Date.UTC(2026, 10, 9))).toBe(16);
    expect(ageStatus(2014, 6, Date.UTC(2026, 10, 9))).toBe('under13');
    expect(ageStatus(2012, 6, Date.UTC(2026, 10, 9))).toBe('minor');
    expect(ageStatus(1990, 1, Date.UTC(2026, 10, 9))).toBe('adult');
    expect(ageStatus(undefined, undefined)).toBe('unknown');
    expect(isEarlierBirth(2012, 6, 1990, 1)).toBe(true);
    expect(isEarlierBirth(1990, 1, 2012, 6)).toBe(false);
  });

  test('onbekend, onder 13 en 13–15 blokkeren delen; 16+ niet; geboorte niet naar ouder', async () => {
    const t = convexTest(schema, modules);
    const unknown = await user(t, 'onbekend');
    await expect(unknown.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u1', locationConsent: false, torchRequested: false,
    })).rejects.toThrow(/AGE_REQUIRED/);
    await expect(unknown.as.mutation(api.tracking.createShareLink, { locationConsent: true })).rejects.toThrow(/AGE_REQUIRED/);

    const child = await user(t, 'kind');
    expect(await child.as.mutation(api.ageGate.declareBirth, { year: 2014, month: 6 })).toEqual({ status: 'under13' });
    await expect(child.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u2', locationConsent: false, torchRequested: false,
    })).rejects.toThrow(/AGE_UNDER_13/);
    await expect(child.as.mutation(api.ageGate.declareBirth, { year: 1990, month: 1 })).rejects.toThrow(/AGE_LOCKED/);

    const teen = await user(t, 'tiener');
    expect(await teen.as.mutation(api.ageGate.declareBirth, { year: 2012, month: 6 })).toEqual({ status: 'minor' });
    await expect(teen.as.mutation(api.deviceContacts.replaceSelection, { contacts: [] })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
    await expect(teen.as.mutation(api.sos.trigger, { clientRef: 'sos-teen' })).rejects.toThrow(/AGE_PARENT_REQUIRED/);
    expect((await teen.as.query(api.profiles.me, {}))?.ageStatus).toBe('minor');

    const adult = await user(t, 'volwassen', { year: 1990, month: 1 });
    await adult.as.mutation(api.security.setPin, { pin: '123456', confirmPin: '123456' });
    const started = await adult.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u3', locationConsent: false, torchRequested: false,
    });
    expect(started.incidentId).toBeTruthy();
  });

  test('account weghalen wist incidentlocatie, billing, foutlog en share-token', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna', { year: 1990, month: 1 });
    const link = await a.as.mutation(api.tracking.createShareLink, { locationConsent: true, scopes: ['location'] });
    const incidentId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('incidents', {
        userId: a.id, kind: 'unsafe', status: 'active', startedAt: Date.now(), torchRequested: false,
      });
      await ctx.db.insert('incidentLocations', { incidentId: id, userId: a.id, lat: 52.1, lng: 4.3, recordedAt: Date.now() });
      await ctx.db.insert('billingEvents', { eventId: 'evt-anna', type: 'INITIAL_PURCHASE', userId: a.id });
      await ctx.db.insert('errorLogs', { source: 'client.test', message: 'fout', userId: a.id });
      await ctx.db.insert('auditLogs', { actorId: a.id, action: 'test.event' });
      return id;
    });
    expect(await t.query(internal.tracking.resolvePublic, { token: link.token })).toBeTruthy();
    await a.as.mutation(api.account.deleteAccount, { confirm: 'VERWIJDER' });
    const left = await t.run(async (ctx) => ({
      user: await ctx.db.get(a.id),
      incident: await ctx.db.get(incidentId),
      locs: (await ctx.db.query('incidentLocations').collect()).length,
      billing: (await ctx.db.query('billingEvents').collect()).length,
      errors: (await ctx.db.query('errorLogs').collect()).length,
      links: (await ctx.db.query('shareLinks').collect()).length,
      actorAudit: (await ctx.db.query('auditLogs').collect()).filter((row) => row.actorId === a.id).length,
    }));
    expect(left).toEqual({ user: null, incident: null, locs: 0, billing: 0, errors: 0, links: 0, actorAudit: 0 });
    expect(await t.query(internal.tracking.resolvePublic, { token: link.token })).toBeNull();
  });
});
