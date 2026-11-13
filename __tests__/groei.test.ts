import { effectiveCaller, fakeCallAllowed, fakeCallNotification, formatCallDuration, isScheduleDelay, paramsFromNotificationData, sanitizeCallerName, DEFAULT_CALLER, FAKE_CALL_SOUND } from '../src/lib/fakeCall';
import { ARRIVAL_PROMPT_M, shouldAskArrived } from '../src/lib/arrival';
import { recordSafeArrival, shouldPromptReview } from '../src/lib/reviewPrompt';
import { annualSavingsPct, ctaLabel, defaultPlan, freeTrialDays, renewalNote, trialLabel } from '../src/lib/paywall';
import { selectPlans } from '../src/lib/offeringLoad';
import { tripLinkMessage } from '../src/lib/composer';
import { DOWNLOAD_URL, inviteMessage, referralResultCopy } from '../src/lib/referralCopy';

describe('nep-oproep', () => {
  it('meteen bellen is gratis; inplannen, eigen naam en stem zijn Premium', () => {
    expect(fakeCallAllowed('now', false)).toBe(true);
    for (const f of ['schedule', 'custom_name', 'voice'] as const) {
      expect(fakeCallAllowed(f, false)).toBe(false);
      expect(fakeCallAllowed(f, true)).toBe(true);
    }
  });
  it('naam wordt opgeschoond en zonder Premium alleen een vaste naam', () => {
    expect(sanitizeCallerName('  Sam \n  de Vries ')).toBe('Sam de Vries');
    expect(sanitizeCallerName('<script>')).toBe('script');
    expect(sanitizeCallerName('')).toBe(DEFAULT_CALLER);
    expect(sanitizeCallerName('x'.repeat(50))).toHaveLength(30);
    expect(effectiveCaller('Sam', false)).toBe(DEFAULT_CALLER);
    expect(effectiveCaller('Papa', false)).toBe('Papa');
    expect(effectiveCaller('Sam', true)).toBe('Sam');
  });
  it('inplan-opties, timer en melding-data', () => {
    expect(isScheduleDelay(5)).toBe(true); expect(isScheduleDelay(3)).toBe(false);
    expect(formatCallDuration(7_400)).toBe('0:07'); expect(formatCallDuration(750_000)).toBe('12:30');
    const n = fakeCallNotification('Mama', true);
    expect(n).toMatchObject({ title: 'Mama', sound: FAKE_CALL_SOUND, data: { type: 'fake_call', caller: 'Mama', voice: '1' } });
    expect(paramsFromNotificationData(n.data)).toEqual({ caller: 'Mama', voice: '1' });
    expect(paramsFromNotificationData({ type: 'sos' })).toBeNull();
    expect(paramsFromNotificationData({ type: 'fake_call', caller: 42 })).toEqual({ caller: DEFAULT_CALLER, voice: '0' });
  });
});

describe('"Ben je er?"', () => {
  const dest = { lat: 52.0907, lng: 5.1214 };
  const now = 1_000_000;
  const near = { lat: 52.0912, lng: 5.1214, accuracyM: 15, recordedAt: now - 10_000 }; // ~55 m
  it('vraagt binnen ~100 m met een vers, nauwkeurig punt terwijl de app deelt', () => {
    expect(shouldAskArrived({ last: near, dest, now, snoozedAt: null, active: true })).toBe(true);
    expect(ARRIVAL_PROMPT_M).toBe(100);
  });
  it('niet bij ver weg, oud punt, onnauwkeurig, gesnoozed, niet actief of zonder bestemming', () => {
    expect(shouldAskArrived({ last: { ...near, lat: 52.1 }, dest, now, snoozedAt: null, active: true })).toBe(false);
    expect(shouldAskArrived({ last: { ...near, recordedAt: now - 5 * 60_000 }, dest, now, snoozedAt: null, active: true })).toBe(false);
    expect(shouldAskArrived({ last: { ...near, accuracyM: 200 }, dest, now, snoozedAt: null, active: true })).toBe(false);
    expect(shouldAskArrived({ last: near, dest, now, snoozedAt: now - 60_000, active: true })).toBe(false);
    expect(shouldAskArrived({ last: near, dest, now, snoozedAt: now - 6 * 60_000, active: true })).toBe(true);
    expect(shouldAskArrived({ last: near, dest, now, snoozedAt: null, active: false })).toBe(false);
    expect(shouldAskArrived({ last: near, dest: null, now, snoozedAt: null, active: true })).toBe(false);
  });
});

describe('beoordeling na 3e veilige aankomst', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); } }; };
  it('pure regel', () => {
    expect(shouldPromptReview(2, null)).toBe(false);
    expect(shouldPromptReview(3, null)).toBe(true);
    expect(shouldPromptReview(9, 123)).toBe(false);
  });
  it('telt alleen schone aankomsten en vraagt één keer', async () => {
    const store = mem();
    const review = { isAvailableAsync: jest.fn(async () => true), hasAction: jest.fn(async () => true), requestReview: jest.fn(async () => {}) };
    expect(await recordSafeArrival({ clean: true, store, review })).toBe('counted');
    expect(await recordSafeArrival({ clean: false, store, review })).toBe('skipped');
    expect(await recordSafeArrival({ clean: true, store, review })).toBe('counted');
    expect(await recordSafeArrival({ clean: true, store, review })).toBe('prompted');
    expect(await recordSafeArrival({ clean: true, store, review })).toBe('counted');
    expect(review.requestReview).toHaveBeenCalledTimes(1);
  });
  it('niet beschikbaar → niet markeren als gevraagd', async () => {
    const store = mem();
    const review = { isAvailableAsync: jest.fn(async () => false), hasAction: jest.fn(async () => true), requestReview: jest.fn(async () => {}) };
    for (let i = 0; i < 3; i++) await recordSafeArrival({ clean: true, store, review });
    expect(review.requestReview).not.toHaveBeenCalled();
    expect(await store.getItem('safewalk.reviewPromptedAt')).toBeNull();
  });
});

describe('Premium-scherm: jaarabonnement en proefperiode uit de winkel', () => {
  const month = { price: 2.99, priceString: '€ 2,99' };
  const yearAndroidTrial = { price: 24.99, priceString: '€ 24,99', pricePerMonthString: '€ 2,08', defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 7 } } } };
  const yearIosTrial = { price: 24.99, priceString: '€ 24,99', introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } };
  it('proefperiode alleen als de winkel hem meldt', () => {
    expect(freeTrialDays(month)).toBeNull();
    expect(freeTrialDays(yearAndroidTrial)).toBe(7);
    expect(freeTrialDays(yearIosTrial)).toBe(7);
    expect(freeTrialDays({ ...month, introPrice: { price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 } })).toBeNull();
    expect(trialLabel(7)).toBe('Eerste week gratis'); expect(trialLabel(30)).toBe('Eerste maand gratis'); expect(trialLabel(null)).toBeNull();
  });
  it('besparing alleen met beide echte prijzen', () => {
    expect(annualSavingsPct(month, yearAndroidTrial)).toBe(30);
    expect(annualSavingsPct(null, yearAndroidTrial)).toBeNull();
    expect(annualSavingsPct(month, { price: 40, priceString: '€ 40' })).toBeNull(); // duurder dan 12× maand
  });
  it('fallback: geen jaarpakket → alleen maand', () => {
    const m = { id: 'm' }; const y = { id: 'y' };
    expect(selectPlans({ current: { monthly: m, availablePackages: [m] } })).toEqual({ monthly: m, annual: null });
    expect(selectPlans({ current: { monthly: m, annual: y, availablePackages: [m, y] } })).toEqual({ monthly: m, annual: y });
    expect(selectPlans({ current: null })).toEqual({ monthly: null, annual: null });
    expect(defaultPlan(true, true)).toBe('annual'); expect(defaultPlan(false, true)).toBe('monthly'); expect(defaultPlan(false, false)).toBeNull();
  });
  it('knop en kleine lettertjes', () => {
    expect(ctaLabel('annual', yearAndroidTrial)).toBe('Start 7 dagen gratis');
    expect(ctaLabel('monthly', month)).toBe('Word Premium – € 2,99/maand');
    expect(renewalNote('annual', yearAndroidTrial)).toMatch(/Na 7 dagen gratis betaal je € 24,99 per jaar/);
    expect(renewalNote('monthly', month)).toMatch(/opzeggen kan altijd/);
  });
});

describe('uitnodigen en meekijklink', () => {
  const url = `https://example.convex.site/track/live?token=${'a'.repeat(64)}`;
  it('meekijklink-bericht alleen met een echte tracking-link', () => {
    expect(tripLinkMessage(url)).toMatch(/geen app nodig/);
    expect(() => tripLinkMessage('https://evil.test/x')).toThrow('BAD_LINK');
  });
  it('uitnodiging bevat downloadlink en alleen beloning als die kan', () => {
    expect(inviteMessage('safewalk://invite/x', true)).toContain(DOWNLOAD_URL);
    expect(inviteMessage('safewalk://invite/x', true)).toMatch(/1 maand Premium/);
    expect(inviteMessage('safewalk://invite/x', false)).not.toMatch(/Premium/);
    expect(referralResultCopy('rewarded')).toMatch(/1 maand/);
    expect(referralResultCopy('inviter_limit')).toBeNull();
  });
});
