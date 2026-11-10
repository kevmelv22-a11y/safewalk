import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { classifyOfferings, classifyStoreError, OFFERING_TIMEOUT_MS, withTimeout } from './offeringLoad';
import { resolvePurchaseKey } from './purchaseKey';

const decision = resolvePurchaseKey({
  platform: Platform.OS,
  variant: process.env.APP_VARIANT,
  iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  testStoreOptIn: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE,
  testStoreKey: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY,
});

const apiKey = decision.mode === 'disabled' ? '' : decision.apiKey;
/** Store- of expliciete Test Store-sleutel. Zonder sleutel geen aankoop en geen verzonnen prijs. */
export const purchasesEnabled = decision.mode === 'store' || decision.mode === 'test_store';
export const testStoreActive = decision.mode === 'test_store';
export const purchaseBlockReason = decision.mode === 'disabled' ? decision.reason : null;
export const ENTITLEMENT = 'premium';

let configuredFor: string | null = null;
let inflight: Promise<void> | null = null;

/** appUserID = Convex user-id. Configure vóór getOfferings; fouten blijven bij de aanroeper. */
export function configurePurchases(userId: string): Promise<void> {
  if (!purchasesEnabled || !apiKey) return Promise.resolve();
  if (configuredFor === userId) return Promise.resolve();
  if (inflight) return inflight.then(() => configurePurchases(userId));
  inflight = (async () => {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    if (configuredFor === null) Purchases.configure({ apiKey, appUserID: userId });
    else await Purchases.logIn(userId);
    configuredFor = userId;
  })().finally(() => { inflight = null; });
  return inflight;
}

export async function resetPurchases() {
  if (purchasesEnabled && configuredFor) {
    await Purchases.logOut().catch(() => {});
    configuredFor = null;
  }
}

export type PremiumOfferingResult =
  | { state: 'disabled'; reason: 'web' | 'no_key' | 'test_opt_in_without_key' | 'test_key_rejected' }
  | { state: 'ready'; pkg: PurchasesPackage; testStore: boolean }
  | { state: 'empty'; reason: 'no_current_offering' | 'no_packages'; testStore: boolean }
  | { state: 'error'; reason: 'timeout' | 'not_configured' | 'failed'; detail: string; testStore: boolean };

/** Wacht op configure, daarna maximaal 12s op het huidige aanbod. Geen fallback-prijs. */
export async function loadPremiumOffering(userId: string): Promise<PremiumOfferingResult> {
  if (!purchasesEnabled || decision.mode === 'disabled') {
    return { state: 'disabled', reason: decision.mode === 'disabled' ? decision.reason : 'no_key' };
  }
  const testStore = decision.mode === 'test_store';
  try {
    await configurePurchases(userId);
    const offerings = await withTimeout(Purchases.getOfferings(), OFFERING_TIMEOUT_MS);
    const classified = classifyOfferings(offerings);
    return { ...classified, testStore };
  } catch (error) {
    return { ...classifyStoreError(error), testStore };
  }
}

export async function buy(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return !!customerInfo.entitlements.active[ENTITLEMENT];
}
export async function restore() {
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active[ENTITLEMENT];
}
