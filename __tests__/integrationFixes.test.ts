/* eslint-disable @typescript-eslint/no-require-imports -- loads app.config / eas.json / prefs via require in Jest */
import { runDangerUnlock } from '../src/lib/dangerUnlock';
import { handleVolumeDoublePress, __resetVolumeCooldown, COOLDOWN_MS } from '../src/lib/volumeAction';
import { smsUrl, whatsappUrl, locationMessage, e164Digits, MAX_SMS_RECIPIENTS } from '../src/lib/composer';
import { mapsAvailable } from '../src/lib/mapsAvailability';
const { buildConfig } = require('../app.config');
const appJson = require('../app.json');

function unlockDeps(verify: () => Promise<{ ok: boolean }>) {
  const calls: string[] = [];
  const upload = jest.fn(async () => { calls.push('upload'); });
  return {
    calls, upload,
    deps: {
      verify: async () => { calls.push('verify'); return verify(); },
      stopRecorder: jest.fn(async () => { calls.push('stopRecorder'); return upload; }),
      stopAlarm: jest.fn(async () => { calls.push('stopAlarm'); }),
      classifyError: (e: unknown) => (/offline/.test(String(e)) ? 'offline' as const : 'error' as const),
    },
  };
}

describe('danger unlock order', () => {
  test('wrong PIN never stops recording or alarm', async () => {
    const t = unlockDeps(async () => ({ ok: false }));
    expect(await runDangerUnlock(t.deps)).toBe('wrong');
    expect(t.deps.stopRecorder).not.toHaveBeenCalled();
    expect(t.deps.stopAlarm).not.toHaveBeenCalled();
  });
  test('offline / server error keeps recording and alarm', async () => {
    const t = unlockDeps(async () => { throw new Error('offline'); });
    expect(await runDangerUnlock(t.deps)).toBe('offline');
    expect(t.deps.stopRecorder).not.toHaveBeenCalled();
    expect(t.deps.stopAlarm).not.toHaveBeenCalled();
  });
  test('correct PIN: verify first, then stop recorder+alarm; upload deferred and never blocks', async () => {
    const t = unlockDeps(async () => ({ ok: true }));
    let release!: () => void;
    t.upload.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    expect(await runDangerUnlock(t.deps)).toBe('ok'); // resolves while upload still pending
    expect(t.calls.slice(0, 3)).toEqual(['verify', 'stopRecorder', 'stopAlarm']);
    release();
  });
  test('upload failure after correct PIN is reported, unlock still ok', async () => {
    const t = unlockDeps(async () => ({ ok: true }));
    const onUploadError = jest.fn();
    t.upload.mockRejectedValue(new Error('x'));
    expect(await runDangerUnlock({ ...t.deps, onUploadError })).toBe('ok');
    await new Promise((r) => setTimeout(r, 0));
    expect(onUploadError).toHaveBeenCalled();
  });
});

describe('volume double press', () => {
  const loc = { locationConsent: true as const, lat: 52, lng: 5, locationAt: 1 };
  beforeEach(() => __resetVolumeCooldown());
  test('without opt-in only opens confirmation screen, never sends', async () => {
    const send = jest.fn(); const navigate = jest.fn();
    expect(await handleVolumeDoublePress({ optedIn: async () => false, getLocation: async () => loc, send, navigate })).toBe('confirm');
    expect(send).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/quick-ping');
  });
  test('opt-in sends once, cooldown blocks spam, no consent sends nothing', async () => {
    const send = jest.fn(async () => ({ recipients: 2 })); const navigate = jest.fn();
    let now = 1_000_000;
    const d = { optedIn: async () => true, getLocation: async () => loc, send, navigate, now: () => now };
    expect(await handleVolumeDoublePress(d)).toBe('sent');
    now += 5_000;
    expect(await handleVolumeDoublePress(d)).toBe('cooldown');
    expect(send).toHaveBeenCalledTimes(1);
    now += COOLDOWN_MS;
    expect(await handleVolumeDoublePress({ ...d, getLocation: async () => ({ locationConsent: false as const }) })).toBe('no_consent');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('composer (user-confirmed only)', () => {
  const url = 'https://agile-capybara-401.convex.site/track/live?token=' + 'a'.repeat(64);
  test('message only for a real tracking link', () => {
    expect(locationMessage(url)).toContain(url);
    expect(() => locationMessage('https://evil.example/x')).toThrow('BAD_LINK');
  });
  test('sms urls per platform, encoded, bounded', () => {
    const body = locationMessage(url);
    expect(smsUrl('ios', ['+31612345678'], body)).toBe(`sms:+31612345678&body=${encodeURIComponent(body)}`);
    expect(smsUrl('ios', ['+31612345678', '+31687654321'], 'hi')).toBe('sms:/open?addresses=+31612345678,+31687654321&body=hi');
    expect(smsUrl('android', ['+31612345678', '+31687654321'], 'a b')).toBe('sms:+31612345678,+31687654321?body=a%20b');
    expect(() => smsUrl('android', [], 'x')).toThrow('NO_RECIPIENTS');
    expect(() => smsUrl('android', Array(MAX_SMS_RECIPIENTS + 1).fill('+31612345678'), 'x')).toThrow('TOO_MANY');
    expect(() => e164Digits('0612;rm')).toThrow('BAD_PHONE');
  });
  test('whatsapp single-recipient link', () => {
    expect(whatsappUrl('+31612345678', 'a&b')).toBe('https://wa.me/31612345678?text=a%26b');
  });
});

describe('app config', () => {
  const base = appJson.expo;
  test('no Google Maps key is written, even if the env is set', () => {
    expect(JSON.stringify(appJson)).not.toContain('${GOOGLE_MAPS');
    const without = buildConfig(base, {});
    expect(without.android.config?.googleMaps).toBeUndefined();
    expect(without.extra.mapsConfigured).toBeUndefined();
    const withKey = buildConfig(base, { GOOGLE_MAPS_ANDROID_API_KEY: 'k' });
    expect(withKey.android.config?.googleMaps).toBeUndefined();
    expect(mapsAvailable('android', without.extra)).toBe(true);
    expect(mapsAvailable('android', withKey.extra)).toBe(true);
    expect(mapsAvailable('ios', without.extra)).toBe(true);
  });
  test('adhoc disables iOS tile extension only, keeps signing IDs; default build untouched', () => {
    const tile = (c: { plugins: unknown[] }) => c.plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-quick-settings-tile') as [string, { ios: Record<string, unknown>; android: unknown }];
    const ad = buildConfig(base, { SAFEWALK_IOS_ADHOC: '1' });
    expect(ad.ios.bundleIdentifier).toBe('app.star4684.aquila7560');
    expect(tile(ad)[1].ios.delegateToAppleTargets).toBe(false);
    expect(tile(ad)[1].android).toEqual(tile(base)[1].android);
    const def = buildConfig(base, {});
    expect(def.ios.bundleIdentifier).toBe('nl.safewalk.app');
    expect(tile(def)[1].ios.delegateToAppleTargets).toBeUndefined();
  });
  test('every build profile has public Convex URLs, none localhost', () => {
        const eas = require('../eas.json');
    for (const [name, p] of Object.entries<{ env?: Record<string, string>; extends?: string }>(eas.build)) {
      const env = p.env ?? eas.build[p.extends!].env;
      expect([name, env.EXPO_PUBLIC_CONVEX_URL]).toEqual([name, expect.stringMatching(/^https:\/\/[a-z-]+-\d+\.convex\.cloud$/)]);
      expect([name, env.EXPO_PUBLIC_CONVEX_SITE_URL]).toEqual([name, expect.stringMatching(/^https:\/\/[a-z-]+-\d+\.convex\.site$/)]);
    }
  });
  test('background recording capability is config-only; runtime default off', () => {
    const audio = base.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-audio');
    expect(audio[1].enableBackgroundRecording).toBe(true);
  });
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); } };
});
test('opt-ins default to off', async () => {
  const p = require('../src/lib/recordingPrefs');
  expect(await p.getBackgroundRecordingOptIn()).toBe(false);
  expect(await p.getVolumeSendOptIn()).toBe(false);
  await p.setVolumeSendOptIn(true);
  expect(await p.getVolumeSendOptIn()).toBe(true);
});
