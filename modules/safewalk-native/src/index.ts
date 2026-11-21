import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

type Caps = { volumeDoublePress: boolean; backgroundTorch: boolean; alarmForegroundService?: boolean; autoSms?: boolean; notes: string };
export type NativeSmsResult = { ok: boolean; reason?: string };
type NativeShape = {
  isVolumeDoublePressSupported(): boolean;
  setVolumeDoublePressEnabled(enabled: boolean): void;
  getCapabilities(): Caps;
  /** Android: Intent.ACTION_DIAL tel:112. iOS: not used (JS tel:). */
  openEmergencyDialer(): Promise<boolean>;
  /** Android: start/stop de alarm-voorgronddienst (mediaPlayback) met vaste melding. */
  startAlarmForegroundService?(): boolean;
  stopAlarmForegroundService?(): boolean;
  isAlarmForegroundServiceRunning?(): boolean;
  canSendSms?(): boolean;
  hasSendSmsPermission?(): boolean;
  sendSms?(phone: string, body: string): Promise<NativeSmsResult>;
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

/**
 * Android: opent de kiezer via ACTION_DIAL met 112 (gebruiker belt zelf).
 * iOS/web/uncompiled: false — caller gebruikt Linking tel:112.
 */
export async function openEmergencyDialer(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Native?.openEmergencyDialer) return false;
  return Native.openEmergencyDialer();
}

/**
 * Android: start de voorgronddienst (type mediaPlayback) met vaste melding "SafeWalk-alarm actief",
 * zodat het alarmgeluid doorgaat met scherm uit. Aanroepen terwijl de app op de voorgrond is.
 * iOS/web/uncompiled: false (geen dienst).
 */
export function startAlarmForegroundService(): boolean {
  if (Platform.OS !== 'android' || !Native?.startAlarmForegroundService) return false;
  return Native.startAlarmForegroundService();
}

export function stopAlarmForegroundService(): boolean {
  if (Platform.OS !== 'android' || !Native?.stopAlarmForegroundService) return false;
  return Native.stopAlarmForegroundService();
}

export function isAlarmForegroundServiceRunning(): boolean {
  if (Platform.OS !== 'android' || !Native?.isAlarmForegroundServiceRunning) return false;
  return Native.isAlarmForegroundServiceRunning();
}

/**
 * Android: stuur één sms via SmsManager. Alleen aanroepen na opt-in en runtime-toestemming.
 * iOS/web/uncompiled: { ok:false, reason:'unsupported' }.
 * In Jest/tests weigert deze functie altijd (geen echte sms).
 */
export async function sendSms(phone: string, body: string): Promise<NativeSmsResult> {
  if (typeof process !== 'undefined' && (process.env.JEST_WORKER_ID || process.env.VITEST || process.env.SAFEWALK_TEST_SMS === '1')) {
    return { ok: false, reason: 'test_guard' };
  }
  if (Platform.OS !== 'android' || !Native?.sendSms) return { ok: false, reason: 'unsupported' };
  return Native.sendSms(phone, body);
}

export function canSendSms(): boolean {
  if (Platform.OS !== 'android' || !Native?.canSendSms) return false;
  return Native.canSendSms();
}

export function hasSendSmsPermission(): boolean {
  if (Platform.OS !== 'android' || !Native?.hasSendSmsPermission) return false;
  return Native.hasSendSmsPermission();
}
