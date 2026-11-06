import { readFileSync } from 'fs';
import { classifyOfferings, classifyStoreError, sanitizeStoreError, selectCurrentPackage, withTimeout } from '../src/lib/offeringLoad';
import { resolvePurchaseKey } from '../src/lib/purchaseKey';

const monthly = { id: 'monthly', product: { priceString: '€4,99' } };
const other = { id: 'other', product: { priceString: '€9,99' } };

describe('aanbod laden', () => {
  test('huidig maandpakket wint; leeg aanbod is geen prijs', () => {
    expect(selectCurrentPackage({ current: { monthly, availablePackages: [other, monthly] } })).toBe(monthly);
    expect(selectCurrentPackage({ current: { monthly: null, availablePackages: [other] } })).toBe(other);
    expect(classifyOfferings({ current: null })).toEqual({ state: 'empty', reason: 'no_current_offering' });
    expect(classifyOfferings({ current: { monthly: null, availablePackages: [] } })).toEqual({ state: 'empty', reason: 'no_packages' });
    expect(classifyOfferings({ current: { monthly, availablePackages: [monthly] } })).toEqual({ state: 'ready', pkg: monthly });
  });

  test('timeout en niet-gestarte module zijn eindige fouten; sleutels gaan uit de tekst', async () => {
    const timeout = classifyStoreError(new Error('OFFERING_TIMEOUT'));
    const unconfigured = classifyStoreError(new Error('There is no singleton instance. configure has not been called'));
    expect(timeout.state === 'error' && timeout.reason).toBe('timeout');
    expect(unconfigured.state === 'error' && unconfigured.reason).toBe('not_configured');
    expect(sanitizeStoreError(new Error('bad key goog_abc123 appl_zzz test_secret'))).not.toMatch(/goog_|appl_|test_/);
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toThrow('OFFERING_TIMEOUT');
  });

  test('premiumscherm toont geen verzonnen prijs', () => {
    const src = readFileSync('app/premium.tsx', 'utf8');
    expect(src).not.toContain('€2,99');
    expect(src).toContain('priceString');
    expect(src).toContain('opnieuw laden');
    expect(src).toContain('Testabonnement — geen echte betaling.');
  });
});

describe('sleutelkeuze', () => {
  const base = {
    platform: 'android',
    iosKey: 'appl_storekey',
    androidKey: 'goog_storekey',
    testStoreOptIn: undefined as string | undefined,
    testStoreKey: undefined as string | undefined,
  };

  test('productie houdt de winkelsleutel en weigert Test Store', () => {
    expect(resolvePurchaseKey({ ...base, variant: 'production' })).toEqual({ mode: 'store', apiKey: 'goog_storekey' });
    expect(resolvePurchaseKey({ ...base, variant: 'production', testStoreOptIn: '1', testStoreKey: 'test_public' }).mode).toBe('store');
    expect(resolvePurchaseKey({ ...base, variant: 'production', androidKey: 'test_public' })).toEqual({ mode: 'disabled', reason: 'test_key_rejected' });
    expect(resolvePurchaseKey({ ...base, platform: 'ios', variant: 'production' })).toEqual({ mode: 'store', apiKey: 'appl_storekey' });
  });

  test('testabonnement alleen met opt-in en test_-sleutel, niet globaal', () => {
    expect(resolvePurchaseKey({ ...base, variant: 'preview' })).toEqual({ mode: 'store', apiKey: 'goog_storekey' });
    expect(resolvePurchaseKey({ ...base, variant: 'preview', testStoreOptIn: '1', testStoreKey: 'test_public' })).toEqual({ mode: 'test_store', apiKey: 'test_public' });
    expect(resolvePurchaseKey({ ...base, variant: 'development', testStoreOptIn: '1' })).toEqual({ mode: 'disabled', reason: 'test_opt_in_without_key' });
    expect(resolvePurchaseKey({ ...base, variant: 'preview', androidKey: 'test_public' })).toEqual({ mode: 'disabled', reason: 'test_key_rejected' });
    expect(resolvePurchaseKey({ ...base, platform: 'web', variant: 'preview' })).toEqual({ mode: 'disabled', reason: 'web' });
    expect(resolvePurchaseKey({ ...base, variant: 'preview', androidKey: '' })).toEqual({ mode: 'disabled', reason: 'no_key' });
  });
});
