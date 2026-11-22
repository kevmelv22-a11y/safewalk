/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, name: string) {
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name, email: `${name}@test.nl` });
    await ctx.db.insert('profiles', {
      userId, displayName: name, defaultGraceMinutes: 5, sosCountdownSeconds: 5,
      onboardingDone: true, restricted: false,
    });
    await ctx.db.insert('subscriptions', { userId, tier: 'free' });
    return userId;
  });
  return { id, as: t.withIdentity({ subject: `${id}|s-${name}` }) };
}

describe('contact zonder account', () => {
  test('eigenaar bewaart naam en nummer of e-mail; ontvanger heeft geen user', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const id = await a.as.mutation(api.deviceContacts.saveManual, {
      displayName: '  Sam  ', phone: '06 12345678',
    });
    const list = await a.as.query(api.deviceContacts.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ displayName: 'Sam', phoneE164: '+31612345678', manual: true });
    expect(list[0].email).toBeUndefined();
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.map((u) => u.name)).toEqual(['anna']);
    const links = await t.run((ctx) => ctx.db.query('shareLinks').collect());
    expect(links).toHaveLength(0);
    const logs = await t.run((ctx) => ctx.db.query('auditLogs').collect());
    expect(JSON.stringify(logs)).not.toContain('612345678');
    expect(JSON.stringify(logs)).not.toContain('Sam');

    await a.as.mutation(api.deviceContacts.saveManual, { id, displayName: 'Sam', email: 'Sam@Example.nl' });
    const edited = await a.as.query(api.deviceContacts.list, {});
    expect(edited[0].email).toBe('sam@example.nl');
    expect(edited[0].phoneE164).toBeUndefined();
  });

  test('ongeldig, leeg en duplicaat worden geweigerd', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: '  ', phone: '0612345678' })).rejects.toThrow(/CONTACT_INVALID/);
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Sam' })).rejects.toThrow(/CONTACT_INVALID/);
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Sam', phone: '12' })).rejects.toThrow(/CONTACT_INVALID/);
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Sam', email: 'geen-mail' })).rejects.toThrow(/CONTACT_INVALID/);
    await a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Sam', phone: '+31612345678' });
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Andere', phone: '06-12345678' })).rejects.toThrow(/CONTACT_DUPLICATE/);
    await a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Kim', email: 'kim@example.nl' });
    await expect(a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Kim 2', email: 'KIM@example.nl' })).rejects.toThrow(/CONTACT_DUPLICATE/);
  });

  test('andere gebruiker ziet en wijzigt het contact niet; adresboek wist handmatige niet', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const id = await a.as.mutation(api.deviceContacts.saveManual, { displayName: 'Sam', phone: '+31612345678' });
    expect(await b.as.query(api.deviceContacts.list, {})).toEqual([]);
    await expect(b.as.mutation(api.deviceContacts.saveManual, { id, displayName: 'Kapen', phone: '+31600000000' })).rejects.toThrow(/NOT_FOUND/);
    await expect(b.as.mutation(api.deviceContacts.remove, { id })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(api.deviceContacts.saveManual, { displayName: 'X', phone: '+31612345678' })).rejects.toThrow();
    await a.as.mutation(api.deviceContacts.replaceSelection, {
      contacts: [{ displayName: 'Lisa', phone: '+31611112222' }, { displayName: 'Sam', phone: '+31612345678' }],
    });
    const list = await a.as.query(api.deviceContacts.list, {});
    expect(list.filter((c) => c.manual).map((c) => c.displayName)).toEqual(['Sam']);
    expect(list.filter((c) => !c.manual).map((c) => c.displayName)).toEqual(['Lisa']);
  });
});
