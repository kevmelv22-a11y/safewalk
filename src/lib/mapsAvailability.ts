import { Platform } from 'react-native';

/**
 * In-app maps do not need a Google key.
 * iOS uses Apple Maps. Android and web use a keyless OpenStreetMap map (OpenFreeMap tiles in a WebView).
 * A runtime failure still shows the existing no-map fallback at the call site.
 */
export function mapsAvailable(_os: string = Platform.OS, _extra?: unknown): boolean {
  return true;
}
