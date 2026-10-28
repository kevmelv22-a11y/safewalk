import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Standaard: app.json ongewijzigd. Met SAFEWALK_IOS_ADHOC=1 (eas.json-profiel 'adhoc'): ad-hoc testbuild
 * onder team 29897MSSY7 met bundle ID app.star4684.aquila7560 (bestaand ad-hoc profiel).
 * Het profiel bevat aps-environment 'production'; als dat ontbreekt (SAFEWALK_STRIP_PUSH=1) wordt het
 * push-entitlement weggelaten en werkt push niet in die build.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.SAFEWALK_IOS_ADHOC !== '1') return base;
  const ios = { ...(base.ios ?? {}) };
  const entitlements: Record<string, unknown> = { ...(ios.entitlements ?? {}) };
  if (process.env.SAFEWALK_STRIP_PUSH === '1') delete entitlements['aps-environment'];
  else entitlements['aps-environment'] = 'production';
  return { ...base, ios: { ...ios, bundleIdentifier: 'app.star4684.aquila7560', entitlements } };
};
