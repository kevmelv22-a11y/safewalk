import type { ConfigContext, ExpoConfig } from 'expo/config';

type PluginEntry = string | [string, Record<string, unknown>];

/**
 * Pure config transform (testable).
 * - Android maps use OpenStreetMap (OpenFreeMap) in a WebView: never inject a Google Maps API key,
 *   even if GOOGLE_MAPS_ANDROID_API_KEY is set in the environment. The app must not crash without a key.
 * - SAFEWALK_IOS_ADHOC=1 (eas profile 'adhoc'): ad-hoc build under team 29897MSSY7 with bundle ID
 *   app.star4684.aquila7560 (existing single-target profile). The iOS 18 Control Center extension of
 *   react-native-quick-settings-tile needs its own bundle ID/profile, so it is disabled here (Android tile unaffected).
 *   The profile carries aps-environment 'production'; SAFEWALK_STRIP_PUSH=1 drops the push entitlement.
 */
export function buildConfig(base: ExpoConfig, env: Record<string, string | undefined>): ExpoConfig {
  const android = { ...(base.android ?? {}) };
  const androidConfig = { ...(android.config ?? {}) };
  delete androidConfig.googleMaps;
  android.config = androidConfig;
  const extra = { ...(base.extra ?? {}) };
  delete (extra as { mapsConfigured?: unknown }).mapsConfigured;
  let out: ExpoConfig = { ...base, android, extra };

  if (env.SAFEWALK_IOS_ADHOC !== '1') return out;
  const ios = { ...(out.ios ?? {}) };
  const entitlements: Record<string, unknown> = { ...(ios.entitlements ?? {}) };
  if (env.SAFEWALK_STRIP_PUSH === '1') delete entitlements['aps-environment'];
  else entitlements['aps-environment'] = 'production';
  const plugins = ((out.plugins ?? []) as PluginEntry[]).map((p): PluginEntry => {
    const name = Array.isArray(p) ? p[0] : p;
    if (name !== 'react-native-quick-settings-tile') return p;
    const opts = Array.isArray(p) ? p[1] : {};
    return [name, { ...opts, ios: { ...((opts.ios as object) ?? {}), delegateToAppleTargets: false } }];
  });
  out = { ...out, plugins: plugins as ExpoConfig['plugins'], ios: { ...ios, bundleIdentifier: 'app.star4684.aquila7560', entitlements } };
  return out;
}

export default ({ config }: ConfigContext): ExpoConfig => buildConfig(config as ExpoConfig, process.env);
