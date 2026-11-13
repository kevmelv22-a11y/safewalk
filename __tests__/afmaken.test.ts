import { ConvexError } from 'convex/values';
import { alertTitle, isNetworkError, mapErrorNl, pinErrorNl, sharingStatus } from '../src/lib/safety';
import { QUICK_LOCATION, volumeSentNote } from '../src/content/quickLocation';
import { pushResultNl, tileResultNl } from '../src/lib/settingsCopy';

// --- expo-location / convex mocks voor de deel-logica ---
const watchRemove = jest.fn();
const mockLoc = {
  perm: 'granted' as string,
  watchPositionAsync: jest.fn(async () => ({ remove: watchRemove })),
};
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: mockLoc.perm })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: mockLoc.perm })),
  getCurrentPositionAsync: jest.fn(async () => null),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchPositionAsync: (...a: unknown[]) => (mockLoc.watchPositionAsync as unknown as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('../src/lib/convex', () => ({
  convex: { mutation: jest.fn(async () => undefined) },
  errorCode: (e: unknown) => String(e),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const location = require('../src/lib/location') as typeof import('../src/lib/location');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { keeperAction } = require('../src/lib/sharingKeeper') as typeof import('../src/lib/sharingKeeper');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deliverSos } = require('../src/lib/sos') as typeof import('../src/lib/sos');

const S1 = 'session1' as never;
const S2 = 'session2' as never;

describe('locatie delen hervatten na herstart', () => {
  beforeEach(async () => { await location.stopSharing(); mockLoc.perm = 'granted'; mockLoc.watchPositionAsync.mockClear(); watchRemove.mockClear(); });

  test('hervat met bestaande toestemming, zonder opnieuw te vragen', async () => {
    expect(await location.ensureSharing(S1)).toBe('resumed');
    expect(location.sharingSessionId()).toBe(S1);
    expect(mockLoc.watchPositionAsync).toHaveBeenCalledTimes(1);
    // stilstaand moet ook punten geven, anders zien meekijkers ten onrechte "verouderd"
    expect((mockLoc.watchPositionAsync.mock.calls[0] as unknown[])[0]).toMatchObject({ distanceInterval: 0, timeInterval: 30_000 });
  });
  test('tweede keer voor dezelfde reis: geen tweede watcher', async () => {
    await location.ensureSharing(S1);
    expect(await location.ensureSharing(S1)).toBe('already');
    expect(mockLoc.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
  test('gelijktijdige aanroepen lekken geen watcher', async () => {
    await Promise.all([location.ensureSharing(S1), location.ensureSharing(S1), location.startSharing(S1)]);
    expect(mockLoc.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
  test('zonder toestemming: niets starten', async () => {
    mockLoc.perm = 'denied';
    expect(await location.ensureSharing(S1)).toBe('no_permission');
    expect(location.sharingSessionId()).toBeNull();
  });
  test('stopSharing ruimt de watcher op en meldt dat aan luisteraars', async () => {
    const seen: unknown[] = [];
    const unsub = location.subscribeSharing((id) => seen.push(id));
    await location.ensureSharing(S1);
    await location.stopSharing();
    unsub();
    expect(watchRemove).toHaveBeenCalled();
    expect(seen).toEqual([S1, null]);
  });
});

describe('keeperAction', () => {
  test('wacht zolang de serverstatus laadt', () => expect(keeperAction(undefined, null)).toBe('wait'));
  test('lopende reis zonder lokale watcher → hervatten', () => expect(keeperAction(S1, null)).toBe('ensure'));
  test('andere reis → overschakelen', () => expect(keeperAction(S2, S1)).toBe('ensure'));
  test('al bezig → niets', () => expect(keeperAction(S1, S1)).toBe('none'));
  test('reis elders beëindigd → stoppen', () => expect(keeperAction(null, S1)).toBe('stop'));
  test('geen reis, niets lokaal → niets', () => expect(keeperAction(null, null)).toBe('none'));
});

describe('deelstatus op het reisscherm', () => {
  const now = 1_000_000_000;
  test('geen watcher = eerlijk NIET gedeeld', () => {
    const s = sharingStatus(false, now - 1000, now);
    expect(s.live).toBe(false); expect(s.kind).toBe('danger'); expect(s.text).toMatch(/NIET gedeeld/);
  });
  test('verse punten = ok', () => expect(sharingStatus(true, now - 30_000, now).kind).toBe('ok'));
  test('nog geen punt = waarschuwing', () => expect(sharingStatus(true, null, now).kind).toBe('warn'));
  test('oud punt = waarschuwing', () => expect(sharingStatus(true, now - 5 * 60_000, now).text).toMatch(/oud/));
});

describe('foutmeldingen veiligheidscode', () => {
  test('netwerkfout is geen foute code', () => {
    expect(pinErrorNl('TypeError: Failed to fetch')).toMatch(/niet gecontroleerd/);
    expect(pinErrorNl('TypeError: Failed to fetch')).not.toMatch(/Onjuiste/);
  });
  test('foute code en limiet', () => {
    expect(pinErrorNl('PIN_WRONG')).toBe('Onjuiste code. Probeer opnieuw.');
    expect(pinErrorNl('RATE_LIMITED')).toBe('Te veel pogingen. Wacht even.');
  });
  test('Engelse server-/netwerkteksten worden Nederlands', () => {
    expect(isNetworkError('Connection lost while action was in flight')).toBe(true);
    expect(mapErrorNl('TIMEOUT')).toMatch(/Geen verbinding/);
    expect(mapErrorNl('[CONVEX M(sos:trigger)] [Request ID: 1] Server Error')).toMatch(/server/);
    expect(mapErrorNl('Locatietoestemming is nodig om je reis te delen.')).toBe('Locatietoestemming is nodig om je reis te delen.');
  });
});

describe('meldingstitels per soort', () => {
  test('alleen een echte gemiste check-in heet zo', () => {
    expect(alertTitle('missed_check_in').title).toMatch(/Check-in gemist/);
    for (const k of ['sos', 'unsafe', 'wrong_pin', 'come_quick', 'arrived_safe']) expect(alertTitle(k).title).not.toMatch(/Check-in gemist/);
  });
  test('locatie-momentopname vs. kom snel', () => {
    expect(alertTitle('come_quick', 'live-123').title).toMatch(/Locatie gedeeld/);
    expect(alertTitle('come_quick', 'come-1').title).toMatch(/Kom snel/);
  });
});

describe('eerlijke tekst volume-omhoog / locatie sturen', () => {
  test('geen "live"-belofte voor een momentopname', () => {
    expect(QUICK_LOCATION.title).not.toMatch(/live/i);
    expect(QUICK_LOCATION.hint).toMatch(/Eén pushmelding/);
    expect(QUICK_LOCATION.hint).toMatch(/geen doorlopend delen/);
  });
  test('volume-omhoog: alleen Android, alleen met SafeWalk open', () => {
    expect(QUICK_LOCATION.volumeAndroid).toMatch(/Android/);
    expect(QUICK_LOCATION.volumeAndroid).toMatch(/volume-omhoog/);
    expect(QUICK_LOCATION.volumeAndroid).toMatch(/alleen terwijl SafeWalk open op je scherm staat/);
    expect(QUICK_LOCATION.volumeAndroid).toMatch(/achtergrond/);
    expect(QUICK_LOCATION.shortcuts).toMatch(/nooit vanzelf/);
  });
  test('statusregels', () => {
    expect(volumeSentNote('2')).toEqual({ kind: 'ok', text: expect.stringMatching(/2 contacten/) });
    expect(volumeSentNote('1')?.text).toMatch(/1 contact gestuurd/);
    expect(volumeSentNote('0')).toEqual({ kind: 'warn', text: expect.stringMatching(/niemand/) });
    expect(volumeSentNote('cooldown')?.kind).toBe('warn');
    expect(volumeSentNote(undefined)).toBeNull();
    expect(volumeSentNote('rommel')).toBeNull();
  });
  test('geen technische codes in instellingen', () => {
    for (const r of ['web', 'simulator', 'permission_denied', 'no_project_id', 'token_failed', 'register_failed', 'x']) {
      expect(pushResultNl(r)).not.toMatch(/APNs|FCM|token|projectId/i);
    }
    for (const r of ['added', 'already_added', 'declined', 'unsupported', 'error', 'uncompiled']) expect(tileResultNl(r)).not.toMatch(/uncompiled|unsupported/);
  });
});

describe('SOS: eerlijk "in wachtrij" alleen bij geen verbinding', () => {
  const mkQueue = () => {
    const items = new Map<string, unknown>();
    return { items, push: jest.fn(async (id: string, p: unknown) => { items.set(id, p); }), remove: jest.fn(async (id: string) => { items.delete(id); }) };
  };
  const payload = { clientRef: 'c1' };
  test('gelukt → uit de wachtrij', async () => {
    const q = mkQueue();
    expect(await deliverSos(q, payload, async () => 'a1' as never)).toEqual({ queued: false, alertId: 'a1' });
    expect(q.items.size).toBe(0);
  });
  test('netwerkfout → blijft in de wachtrij', async () => {
    const q = mkQueue();
    expect(await deliverSos(q, payload, async () => { throw new Error('TIMEOUT'); })).toEqual({ queued: true });
    expect(q.items.has('c1')).toBe(true);
  });
  test('server weigert → uit de wachtrij en fout zichtbaar', async () => {
    const q = mkQueue();
    await expect(deliverSos(q, payload, async () => { throw new ConvexError('AGE_PARENT_REQUIRED'); })).rejects.toBeInstanceOf(ConvexError);
    expect(q.items.size).toBe(0);
  });
  test('alleen DEZE SOS wordt verstuurd (geen oud item als resultaat)', async () => {
    const q = mkQueue(); q.items.set('old', { clientRef: 'old' });
    const sent: string[] = [];
    await deliverSos(q, payload, async (p) => { sent.push(p.clientRef); return 'a2' as never; });
    expect(sent).toEqual(['c1']);
  });
});
