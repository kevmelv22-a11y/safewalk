import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AUTO_SMS_INTERVAL_MS, AUTO_SMS_MAX_BODY, AUTO_SMS_MAX_ROUNDS, autoSmsAgeOk, autoSmsBody,
  decideAutoSms, normalizeSmsPhones, sendAutoSmsRound, setAutoSmsSenderForTests, testGuardActive,
} from '../src/lib/autoSms';

const loc = { lat: 52.37012, lng: 4.89012 };

describe('automatische sms (Android, mock-verzender)', () => {
  afterEach(() => setAutoSmsSenderForTests(null));

  test('bericht is kort, heeft coördinaten en kaartlink, max 160 tekens', () => {
    const body = autoSmsBody(loc.lat, loc.lng);
    expect(body.length).toBeLessThanOrEqual(AUTO_SMS_MAX_BODY);
    expect(body).toMatch(/52\.37012/);
    expect(body).toMatch(/maps\.google\.com\/\?q=52\.37012,4\.89012/);
    expect(body).toMatch(/SafeWalk/);
    expect(body).not.toMatch(/gegarandeerd veilig/i);
  });

  test('beslisboom: alleen Android, opt-in, geen internet, actief delen, toestemming, ontvangers, locatie', () => {
    const base = {
      platform: 'android', optIn: true, ageOk: true, permission: true, connection: 'sms_only' as const,
      active: true, roundsSent: 0, phones: ['+31612345678'], ...loc, now: 1_000_000,
    };
    expect(decideAutoSms(base).action).toBe('send');
    expect(decideAutoSms({ ...base, platform: 'ios' })).toEqual({ action: 'skip', reason: 'not_android' });
    expect(decideAutoSms({ ...base, optIn: false })).toEqual({ action: 'skip', reason: 'opt_out' });
    expect(decideAutoSms({ ...base, ageOk: false })).toEqual({ action: 'skip', reason: 'underage' });
    expect(decideAutoSms({ ...base, permission: false })).toEqual({ action: 'skip', reason: 'no_permission' });
    expect(decideAutoSms({ ...base, connection: 'online' })).toEqual({ action: 'skip', reason: 'online' });
    expect(decideAutoSms({ ...base, active: false })).toEqual({ action: 'skip', reason: 'inactive' });
    expect(decideAutoSms({ ...base, lat: undefined, lng: undefined })).toEqual({ action: 'skip', reason: 'no_location' });
    expect(decideAutoSms({ ...base, phones: [] })).toEqual({ action: 'skip', reason: 'no_recipients' });
    expect(decideAutoSms({ ...base, lastRoundAt: base.now - 60_000 })).toEqual({ action: 'skip', reason: 'interval' });
    expect(decideAutoSms({ ...base, lastRoundAt: base.now - AUTO_SMS_INTERVAL_MS }).action).toBe('send');
    expect(decideAutoSms({ ...base, roundsSent: AUTO_SMS_MAX_ROUNDS })).toEqual({ action: 'skip', reason: 'cap' });
    const sent = decideAutoSms(base);
    if (sent.action !== 'send') throw new Error('expected send');
    expect(sent.phones).toEqual(['+31612345678']);
    expect(sent.body.length).toBeLessThanOrEqual(160);
  });

  test('leeftijd: 16+ altijd, 13–15 alleen met kindermodus', () => {
    expect(autoSmsAgeOk('adult', false)).toBe(true);
    expect(autoSmsAgeOk('minor', false)).toBe(false);
    expect(autoSmsAgeOk('minor', true)).toBe(true);
    expect(autoSmsAgeOk('under13', true)).toBe(false);
    expect(autoSmsAgeOk('unknown', false)).toBe(false);
  });

  test('verzender is een mock: er gaat nooit een echte sms naar een nummer', async () => {
    const calls: { phone: string; body: string }[] = [];
    setAutoSmsSenderForTests(async (phone, body) => { calls.push({ phone, body }); return { ok: true }; });
    const r = await sendAutoSmsRound(['+31612345678', 'niet-geldig', '+31612345678', '+31687654321'], autoSmsBody(loc.lat, loc.lng));
    expect(r.sent).toEqual(['+31612345678', '+31687654321']);
    expect(r.failed).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(testGuardActive()).toBe(true);
  });

  test('mislukte mock telt niet als verstuurd (geen echte sms)', async () => {
    setAutoSmsSenderForTests(async () => ({ ok: false, reason: 'failed' }));
    const r = await sendAutoSmsRound(['+31612345678'], 'SafeWalk: test');
    expect(r.sent).toEqual([]);
    expect(r.failed).toEqual(['+31612345678']);
  });

  test('nummers normaliseren en max 5 ontvangers', () => {
    const phones = normalizeSmsPhones([
      '+31612345678', '+31 6 12345678', '+31600000000', '+31600000001', '+31600000002', '+31600000003', 'abc',
    ]);
    expect(phones[0]).toBe('+31612345678');
    expect(phones).toHaveLength(5);
  });

  test('app.json heeft SEND_SMS op Android, niet in iOS infoPlist', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
    expect(app.expo.android.permissions).toContain('android.permission.SEND_SMS');
    const ios = JSON.stringify(app.expo.ios ?? {});
    expect(ios).not.toMatch(/SEND_SMS|send-sms/i);
  });
});
