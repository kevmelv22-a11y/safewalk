import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Android uses Google Maps and crashes/blank-renders without an API key. The key is only injected
 * by app.config.ts when GOOGLE_MAPS_ANDROID_API_KEY is set at build time (extra.mapsConfigured.android).
 * iOS uses Apple Maps (no key).
 */
export function mapsAvailable(os: string = Platform.OS, extra: unknown = Constants.expoConfig?.extra): boolean {
  if (os !== 'android') return true;
  return Boolean((extra as { mapsConfigured?: { android?: boolean } } | undefined)?.mapsConfigured?.android);
}
