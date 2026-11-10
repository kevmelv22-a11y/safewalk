/**
 * Welke RevenueCat-sleutel een build mag gebruiken.
 * Productiesleutels (goog_/appl_) blijven de standaard.
 * Test Store alleen met expliciete opt-in én een test_-sleutel, nooit in APP_VARIANT=production.
 */

export type PurchaseKeyInput = {
  platform: string;
  variant: string | undefined;
  iosKey: string | undefined;
  androidKey: string | undefined;
  testStoreOptIn: string | undefined;
  testStoreKey: string | undefined;
};

export type PurchaseKeyDecision =
  | { mode: 'store'; apiKey: string }
  | { mode: 'test_store'; apiKey: string }
  | { mode: 'disabled'; reason: 'web' | 'no_key' | 'test_opt_in_without_key' | 'test_key_rejected' };

const STORE_KEY = /^(?:goog|appl)_[A-Za-z0-9]+$/;
const TEST_KEY = /^test_[A-Za-z0-9]+$/;

function trimKey(value: string | undefined) {
  return (value ?? '').trim();
}

export function resolvePurchaseKey(input: PurchaseKeyInput): PurchaseKeyDecision {
  if (input.platform === 'web') return { mode: 'disabled', reason: 'web' };
  const production = input.variant === 'production';
  const optIn = input.testStoreOptIn === '1';
  const testKey = trimKey(input.testStoreKey);
  const platformKey = trimKey(input.platform === 'ios' ? input.iosKey : input.androidKey);

  if (production) {
    if (optIn || TEST_KEY.test(platformKey) || TEST_KEY.test(testKey)) {
      if (!STORE_KEY.test(platformKey)) return { mode: 'disabled', reason: 'test_key_rejected' };
    }
    if (!platformKey) return { mode: 'disabled', reason: 'no_key' };
    if (!STORE_KEY.test(platformKey)) return { mode: 'disabled', reason: 'test_key_rejected' };
    return { mode: 'store', apiKey: platformKey };
  }

  if (optIn) {
    if (!TEST_KEY.test(testKey)) return { mode: 'disabled', reason: 'test_opt_in_without_key' };
    return { mode: 'test_store', apiKey: testKey };
  }

  if (!platformKey) return { mode: 'disabled', reason: 'no_key' };
  if (TEST_KEY.test(platformKey) || !STORE_KEY.test(platformKey)) {
    return { mode: 'disabled', reason: 'test_key_rejected' };
  }
  return { mode: 'store', apiKey: platformKey };
}
