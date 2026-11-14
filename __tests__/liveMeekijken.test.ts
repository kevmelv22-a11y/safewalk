import fs from 'fs';
import path from 'path';
import { feedShake, newShakeState, SHAKE_COOLDOWN_MS } from '../src/lib/shake';
import { validateStartInput, sharingStatus } from '../src/lib/safety';
import * as copy from '../src/content/liveSharing';

// --- mocks: achtergrondlocatie ---
const mockBg = { started: false, available: true, startThrows: false, tasks: {} as Record<string, (b: unknown) => Promise<void>> };
const mockStart = jest.fn(async () => { if (mockBg.startThrows) throw new Error('no service'); mockBg.started = true; });
const mockStop = jest.fn(async () => { mockBg.started = false; });
const mockWatchRemove = jest.fn();
const mockWatch = jest.fn(async () => ({ remove: mockWatchRemove }));
const mockMutation = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { Fitness: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => null),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchPositionAsync: (...a: unknown[]) => (mockWatch as unknown as (...x: unknown[]) => unknown)(...a),
  startLocationUpdatesAsync: (...a: unknown[]) => (mockStart as unknown as (...x: unknown[]) => unknown)(...a),
  stopLocationUpdatesAsync: (...a: unknown[]) => (mockStop as unknown as (...x: unknown[]) => unknown)(...a),
  hasStartedLocationUpdatesAsync: jest.fn(async () => mockBg.started),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: (name: string, fn: (b: unknown) => Promise<void>) => { mockBg.tasks[name] = fn; },
  isAvailableAsync: jest.fn(async () => mockBg.available),
}));
jest.mock('../src/lib/convex', () => ({
  convex: { mutation: (...a: unknown[]) => mockMutation(...a) },
  errorCode: (e: unknown) => String(e),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const location = require('../src/lib/location') as typeof import('../src/lib/location');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ASmod = require('@react-native-async-storage/async-storage');
const AsyncStorage = (ASmod.default ?? ASmod) as { getItem(k: string): Promise<string | null> };

const S1 = 'session1' as never;
const loc = (t: number) => ({ timestamp: t, coords: { latitude: 52.37, longitude: 4.9, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null } });

describe('achtergrondlocatie tijdens een reis', () => {
  beforeEach(async () => {
    await location.stopSharing();
    Object.assign(mockBg, { started: false, available: true, startThrows: false });
    mockStart.mockClear(); mockStop.mockClear(); mockWatch.mockClear(); mockMutation.mockClear();
  });

  test('taak is bij het laden gedefinieerd', () => expect(mockBg.tasks[location.TRIP_LOCATION_TASK]).toBeDefined());

  test('start met voorgronddienst + melding, geen watcher', async () => {
    await location.startSharing(S1, { until: Date.now() + 3600_000 });
    expect(mockStart).toHaveBeenCalledTimes(1);
    const opts = (mockStart.mock.calls[0] as unknown[])[1] as typeof location.BACKGROUND_OPTIONS;
    expect(opts.foregroundService?.notificationTitle).toBe('SafeWalk deelt je locatie');
    expect(opts.foregroundService?.killServiceOnDestroy).toBe(true);
    expect(opts).toMatchObject({ timeInterval: 30_000, distanceInterval: 0, pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true });
    expect(mockWatch).not.toHaveBeenCalled();
    expect(location.sharingMode()).toBe('background');
  });

  test('tweede start voor dezelfde reis start niets dubbel', async () => {
    await location.startSharing(S1);
    await location.ensureSharing(S1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  test('stop zet de achtergrondtaak echt uit en wist de reis', async () => {
    await location.startSharing(S1);
    await location.stopSharing();
    expect(mockStop).toHaveBeenCalledWith(location.TRIP_LOCATION_TASK);
    expect(location.sharingMode()).toBeNull();
    expect(await AsyncStorage.getItem('safewalk.activeSession')).toBeNull();
    expect(await AsyncStorage.getItem('safewalk.activeSessionUntil')).toBeNull();
  });

  test('geen dienst mogelijk → terugval op delen met app open', async () => {
    mockBg.startThrows = true;
    await location.startSharing(S1);
    expect(mockWatch).toHaveBeenCalledTimes(1);
    expect(location.sharingMode()).toBe('foreground');
  });

  test('TaskManager niet beschikbaar → terugval', async () => {
    mockBg.available = false;
    await location.startSharing(S1);
    expect(mockStart).not.toHaveBeenCalled();
    expect(location.sharingMode()).toBe('foreground');
  });

  test('bovengrens: taak stopt zichzelf na de reis', async () => {
    await location.startSharing(S1, { until: Date.now() + 60_000 });
    expect(await location.handleBackgroundLocations([loc(Date.now())], Date.now() + 120_000)).toBe('stopped');
    expect(mockStop).toHaveBeenCalled();
  });

  test('zonder lokale reis: taak stopt (nooit buiten een reis)', async () => {
    mockBg.started = true;
    expect(await location.handleBackgroundLocations([loc(Date.now())])).toBe('stopped');
    expect(mockStop).toHaveBeenCalled();
  });

  test('batch: alleen het nieuwste punt, niet vaker dan elke 25 s', () => {
    expect(location.pickBackgroundPoint([], 0)).toBeNull();
    expect(location.pickBackgroundPoint([loc(1000), loc(40_000), loc(30_000)], 0)?.timestamp).toBe(40_000);
    expect(location.pickBackgroundPoint([loc(50_000)], 40_000)).toBeNull();
    expect(location.pickBackgroundPoint([loc(65_000)], 40_000)?.timestamp).toBe(65_000);
  });

  test('upload vanuit de achtergrond', async () => {
    await location.startSharing(S1, { until: Date.now() + 3600_000 });
    mockMutation.mockClear();
    const t = Date.now() + 60_000;
    expect(await location.handleBackgroundLocations([loc(t)], t)).toBe('uploaded');
    expect(mockMutation).toHaveBeenCalled();
    expect(await location.handleBackgroundLocations([loc(t + 1000)], t + 1000)).toBe('skipped');
  });

  test('statustekst eerlijk per modus', () => {
    const now = Date.now();
    expect(sharingStatus(true, now - 10_000, now, 'background').text).toMatch(/scherm uit/);
    expect(sharingStatus(true, now - 10_000, now, 'foreground').text).toMatch(/zolang SafeWalk open is/);
  });
});

describe('schudden voor SOS', () => {
  test('gewoon lopen/tas triggert niet', () => {
    const st = newShakeState();
    let hit = false;
    for (let t = 0; t < 10_000; t += 100) hit = feedShake(st, 0.3, 1.2, 0.4, t) || hit;
    expect(hit).toBe(false);
  });
  test('één harde klap triggert niet', () => {
    const st = newShakeState();
    expect(feedShake(st, 3, 3, 0, 0)).toBe(false);
    expect(feedShake(st, 0, 1, 0, 100)).toBe(false);
  });
  test('stevig schudden (4 pieken binnen 1,5 s) triggert, daarna afkoelperiode', () => {
    const st = newShakeState();
    const peaks = [0, 300, 600, 900];
    const results = peaks.map((t) => feedShake(st, 3, 0.5, 0.5, t));
    expect(results.at(-1)).toBe(true);
    const again = [1200, 1500, 1800, 2100].map((t) => feedShake(st, 3, 0.5, 0.5, t));
    expect(again.some(Boolean)).toBe(false);
    const later = [0, 300, 600, 900].map((t) => feedShake(st, 3, 0.5, 0.5, SHAKE_COOLDOWN_MS + 2000 + t));
    expect(later.at(-1)).toBe(true);
  });
  test('pieken te ver uit elkaar triggeren niet', () => {
    const st = newShakeState();
    expect([0, 800, 1600, 2400].map((t) => feedShake(st, 3, 0, 0, t)).some(Boolean)).toBe(false);
  });
});

describe('starten: reis, timer, alleen link', () => {
  const now = Date.parse('2026-11-14T20:00:00Z');
  const arrival = new Date(now + 30 * 60_000);
  test('alleen link, geen contacten: mag', () => expect(validateStartInput({ destination: 'Date', arrival, viewerIds: [], withLink: true }, now)).toBeNull());
  test('geen contacten en geen link: duidelijke fout', () => expect(validateStartInput({ destination: 'Date', arrival, viewerIds: [], withLink: false }, now)).toMatch(/meekijklink/));
  test('met contacten: gewone controle', () => expect(validateStartInput({ destination: 'Station', arrival, viewerIds: ['a'], withLink: false }, now)).toBeNull());
  test('tijd in het verleden blijft fout', () => expect(validateStartInput({ destination: 'Station', arrival: new Date(now - 60_000), viewerIds: [], withLink: true }, now)).not.toBeNull());
});

describe('teksten', () => {
  const all = JSON.stringify(copy);
  test('geen veiligheidsgarantie', () => expect(all).not.toMatch(/gegarandeerd|garantie|100% veilig/i));
  test('uitleg vóór toestemming noemt melding en stoppen', () => {
    expect(all).toMatch(/melding/i);
    expect(all).toMatch(/stop/i);
  });
  test('modus-label', () => {
    expect(copy.modeLabel('background')).toMatch(/achtergrond|scherm uit/);
    expect(copy.modeLabel('foreground')).toMatch(/open/);
  });
});

describe('app.json: minimale rechten', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
  const loc = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location')[1];
  test('voorgronddienst aan, achtergrondlocatie uit', () => {
    expect(loc.isAndroidForegroundServiceEnabled).toBe(true);
    expect(loc.isAndroidBackgroundLocationEnabled).toBe(false);
    expect(app.android.permissions).toContain('FOREGROUND_SERVICE_LOCATION');
    expect(app.android.blockedPermissions).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(app.android.blockedPermissions).not.toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
  });
  test('sensoren zonder bewegingsherkenning-recht', () => {
    expect(app.android.blockedPermissions).toContain('android.permission.ACTIVITY_RECOGNITION');
    expect(app.plugins).toContainEqual(['expo-sensors', { motionPermission: false }]);
  });
  test('iOS achtergrondmodus locatie', () => expect(app.ios.infoPlist.UIBackgroundModes).toContain('location'));
});
