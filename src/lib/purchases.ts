import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

// Publieke RevenueCat SDK-sleutels via env. Zonder sleutel is Premium-aankoop uitgeschakeld (geen nep-sleutels).
const apiKey = Platform.select({ ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY }) ?? '';
export const purchasesEnabled = Boolean(apiKey);
export const ENTITLEMENT = 'premium';
let configuredFor: string | null = null;

/** appUserID = Convex user-id, zodat de webhook het abonnement aan de juiste gebruiker koppelt. */
export async function configurePurchases(userId: string) {
  if (!purchasesEnabled || configuredFor === userId) return;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
  if (configuredFor === null) Purchases.configure({ apiKey, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}
export async function resetPurchases() { if (purchasesEnabled && configuredFor) { await Purchases.logOut().catch(() => {}); configuredFor = null; } }

export async function getPremiumPackage(): Promise<PurchasesPackage | null> {
  if (!purchasesEnabled) return null;
  const o = await Purchases.getOfferings();
  return o.current?.monthly ?? o.current?.availablePackages[0] ?? null;
}
export async function buy(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return !!customerInfo.entitlements.active[ENTITLEMENT];
}
export async function restore() {
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active[ENTITLEMENT];
}
