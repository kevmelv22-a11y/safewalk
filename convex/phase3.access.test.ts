/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';

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

describe('tracking + revoke', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  test('token gehashed; expired/revoked resolve null; live alleen met verse updater', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '121212', confirmPin: '121212' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u1', locationConsent: true, lat: 52.1, lng: 5.1, locationAt: Date.now(),
      torchRequested: false, createTrackingLink: true, shareRecordingScope: true,
    });
    expect(started.shareToken).toMatch(/^[0-9a-f]{64}$/);
    const rows = await t.run((ctx) => ctx.db.query('shareLinks').collect());
    expect(rows[0].tokenHash).not.toBe(started.shareToken);
    expect(rows[0].scopes).toContain('location');
    expect(rows[0].scopes).toContain('recording');

    const ok = await t.query(internal.tracking.resolvePublic, { token: started.shareToken! });
    // Fresh incident location from startUnsafe → live possible
    expect(ok).toBeTruthy();
    expect(ok!.updaterActive).toBe(true);
    expect(ok!.live).toBe(true);

    await a.as.mutation(api.tracking.revokeShareLink, { id: rows[0]._id });
    const after = await t.query(internal.tracking.resolvePublic, { token: started.shareToken! });
    expect(after).toBeNull();
  });

  test('einde incident trekt links in', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '343434', confirmPin: '343434' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u2', locationConsent: true, lat: 52.2, lng: 5.2, locationAt: Date.now(),
      torchRequested: false, createTrackingLink: true,
    });
    await a.as.mutation(api.security.verifyPin, {
      pin: '343434', purpose: 'unlock_danger', incidentId: started.incidentId!,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const links = await t.run((ctx) => ctx.db.query('shareLinks').collect());
    expect(links.every((l) => !!l.revokedAt)).toBe(true);
    const resolved = await t.query(internal.tracking.resolvePublic, { token: started.shareToken! });
    expect(resolved).toBeNull();
    vi.useRealTimers();
  });

  test('zonder locationConsent geen tracking-link', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '565656', confirmPin: '565656' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u3', locationConsent: false, torchRequested: false, createTrackingLink: true,
    });
    expect(started.shareToken).toBeNull();
  });

  test('createShareLink weigert location scope zonder consent', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await expect(a.as.mutation(api.tracking.createShareLink, {
      label: 'x', locationConsent: false, scopes: ['location'],
    })).rejects.toThrow(/LOCATION_CONSENT/);
  });
});

describe('recordings ACL + delete', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  test('owner download ok; stranger forbidden; delete verwijdert storage meta', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const b = await user(t, 'bram');
    const storageId = await t.run(async (ctx) => {
      // Fake storage id via _storage is hard in convex-test — skip real blob;
      // insert recording row with a storage id created via generateUploadUrl path simulation:
      return await ctx.storage.store(new Blob(['abc'], { type: 'audio/webm' }));
    });
    const { id } = await a.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: 3,
    });
    const url = await a.as.mutation(api.recordings.getDownloadUrl, { id });
    expect(url.temporary).toBe(true);
    expect(url.url).toBeTruthy();
    await expect(b.as.mutation(api.recordings.getDownloadUrl, { id })).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    // trusted contact mag wel
    const token = await a.as.mutation(api.contacts.createInvitation, {});
    await b.as.mutation(api.contacts.respondInvitation, { token, accept: true });
    const okB = await b.as.mutation(api.recordings.getDownloadUrl, { id });
    expect(okB.url).toBeTruthy();
    await a.as.mutation(api.recordings.remove, { id });
    await expect(a.as.mutation(api.recordings.getDownloadUrl, { id })).rejects.toThrow();
    const list = await a.as.query(api.recordings.listMine, {});
    expect(list.find((x) => x.id === id)).toBeUndefined();
  });

  test('revoked share token kan recording niet resolven', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '787878', confirmPin: '787878' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u4', locationConsent: true, lat: 52.3, lng: 5.3, locationAt: Date.now(),
      torchRequested: false, createTrackingLink: true, shareRecordingScope: true,
    });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(['x'], { type: 'audio/webm' })));
    const { id } = await a.as.mutation(api.recordings.finalize, {
      storageId, mime: 'audio/webm', byteSize: 1, incidentId: started.incidentId!,
    });
    const before = await t.query(internal.tracking.resolveRecordingDownload, { token: started.shareToken!, recordingId: id });
    expect(before).toBeTruthy();
    const link = await t.run((ctx) => ctx.db.query('shareLinks').first());
    await a.as.mutation(api.tracking.revokeShareLink, { id: link!._id });
    const after = await t.query(internal.tracking.resolveRecordingDownload, { token: started.shareToken!, recordingId: id });
    expect(after).toBeNull();
  });
});

describe('deviceContacts minimization', () => {
  test('alleen genormaliseerde E164; te korte nummers weg', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    const r = await a.as.mutation(api.deviceContacts.replaceSelection, {
      contacts: [
        { displayName: 'Jan', phone: '06 12345678' },
        { displayName: 'X', phone: '12' },
        { displayName: 'Lisa', phone: '+31611112222' },
      ],
    });
    expect(r.saved).toBe(2);
    const list = await a.as.query(api.deviceContacts.list, {});
    expect(list.every((c) => c.phoneE164.startsWith('+'))).toBe(true);
    expect(list.map((c) => c.displayName).sort()).toEqual(['Jan', 'Lisa']);
  });
});

describe('permission / consent gates', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  test('pingLocation zonder consent faalt', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await a.as.mutation(api.security.setPin, { pin: '909090', confirmPin: '909090' });
    const started = await a.as.mutation(api.incidents.startUnsafe, {
      clientRef: 'u5', locationConsent: false, torchRequested: false,
    });
    await expect(a.as.mutation(api.incidents.pingLocation, {
      incidentId: started.incidentId!, lat: 1, lng: 2, recordedAt: Date.now(), locationConsent: false,
    })).rejects.toThrow(/LOCATION_CONSENT/);
  });

  test('sendLiveLocationNow zonder consent faalt', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'anna');
    await expect(a.as.mutation(api.incidents.sendLiveLocationNow, {
      lat: 52, lng: 5, locationAt: Date.now(), locationConsent: false,
    })).rejects.toThrow(/LOCATION_CONSENT/);
  });
});
