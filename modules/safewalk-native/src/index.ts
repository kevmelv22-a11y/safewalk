import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

type Caps = { volumeDoublePress: boolean; backgroundTorch: boolean; notes: string };
type NativeShape = {
  isVolumeDoublePressSupported(): boolean;
  setVolumeDoublePressEnabled(enabled: boolean): void;
  getCapabilities(): Caps;
  addListener?(event: string, cb: () => void): { remove: () => void };
};

function loadNative(): NativeShape | null {
  if (Platform.OS === 'web') return null;
  try {
    return requireNativeModule<NativeShape>('SafewalkNative');
  } catch {
    return null;
  }
}

const Native = loadNative();

/** Foreground-only volume×2. iOS: unsupported. Web: false. */
export function isVolumeDoublePressSupported(): boolean {
  if (!Native) return false;
  return Native.isVolumeDoublePressSupported();
}

export function setVolumeDoublePressEnabled(enabled: boolean): void {
  Native?.setVolumeDoublePressEnabled(enabled);
}

export function getNativeCapabilities(): Caps & { compiled: boolean } {
  if (!Native) {
    return {
      volumeDoublePress: false,
      backgroundTorch: false,
      notes: 'Native module niet geladen (web/Expo Go/uncompiled). Gebruik deep link /quick-ping.',
      compiled: false,
    };
  }
  return { ...Native.getCapabilities(), compiled: true };
}

export function addVolumeDoublePressListener(handler: () => void) {
  if (!Native?.addListener) return { remove: () => undefined };
  return Native.addListener('onVolumeDoublePress', handler);
}
