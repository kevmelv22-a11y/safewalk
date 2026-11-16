import { SHARE_COPY, AUTO_SMS_COPY, OFFLINE_SMS_COPY } from '../src/content/longShare';
import { shareExpiry, shouldPromptRenewal, SHARE_DURATION_LABEL, SHARE_MAX_MS } from '../convex/longShare';
import { validateShareInput } from '../src/lib/safety';
import { shouldShowOfflineSmsPrompt, OFFLINE_PROMPT_INTERVAL_MS } from '../src/lib/shareOfflinePrompt';
import { smsBodyUrl } from '../src/lib/composer';

const H = 3600_000;

describe('langdurig delen (teksten en regels)', () => {
  test('Nederlandse labels en geen veiligheidsbelofte', () => {
    expect(SHARE_DURATION_LABEL['1h']).toBe('1 uur');
    expect(SHARE_DURATION_LABEL.until_stop).toBe('Tot ik stop');
    const blob = `${SHARE_COPY.intro} ${SHARE_COPY.untilStopHint} ${AUTO_SMS_COPY.hint} ${OFFLINE_SMS_COPY.body}`;
    expect(blob).not.toMatch(/gegarandeerd veilig/i);
    expect(SHARE_COPY.untilStopHint).toMatch(/24 uur/);
    expect(AUTO_SMS_COPY.hint).toMatch(/geld kosten/);
    expect(OFFLINE_SMS_COPY.body).toMatch(/Jij tikt zelf op versturen/);
  });

  test('validateShareInput: contact of link, max 24 uur', () => {
    const now = 1_700_000_000_000;
    expect(validateShareInput({ arrival: new Date(now + 4 * H), viewerIds: ['u1'], withLink: false }, now)).toBeNull();
    expect(validateShareInput({ arrival: new Date(now + 4 * H), viewerIds: [], withLink: true }, now)).toBeNull();
    expect(validateShareInput({ arrival: new Date(now + 4 * H), viewerIds: [], withLink: false }, now)).toMatch(/contact/);
    expect(validateShareInput({ arrival: new Date(now + 30 * 1000), viewerIds: ['u1'], withLink: false }, now)).toMatch(/toekomst/);
    expect(validateShareInput({ arrival: new Date(now + 25 * H), viewerIds: ['u1'], withLink: false }, now)).toMatch(/24 uur/);
  });

  test('sms-herinnering hoogstens elke 15 minuten, niet bij auto-sms', () => {
    const now = 1_000_000;
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'offline', now })).toBe(true);
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'sms_only', now })).toBe(true);
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'online', now })).toBe(false);
    expect(shouldShowOfflineSmsPrompt({ active: false, connection: 'offline', now })).toBe(false);
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'offline', now, lastPromptAt: now - 60_000 })).toBe(false);
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'offline', now, lastPromptAt: now - OFFLINE_PROMPT_INTERVAL_MS })).toBe(true);
    expect(shouldShowOfflineSmsPrompt({ active: true, connection: 'offline', now, autoSmsActive: true })).toBe(false);
  });

  test('smsBodyUrl opent alleen de composer, zonder nummer', () => {
    expect(smsBodyUrl('ios', 'Hallo')).toBe('sms:&body=Hallo');
    expect(smsBodyUrl('android', 'a b')).toBe('sms:?body=a%20b');
  });

  test('until_stop krijgt 24-uurslimiet', () => {
    const now = 5_000;
    expect(shareExpiry('until_stop', now).endsAt).toBe(now + SHARE_MAX_MS);
    expect(shouldPromptRenewal({ kind: 'share', shareUntilStop: true, expectedArrival: now + 10 * 60_000 }, now)).toBe(true);
  });
});
