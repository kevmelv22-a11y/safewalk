export function isVolumeDoublePressSupported() { return false; }
export function setVolumeDoublePressEnabled(_enabled: boolean) { /* no-op */ }
export function getNativeCapabilities() {
  return {
    volumeDoublePress: false,
    backgroundTorch: false,
    notes: 'Web: geen native volume/tile. Gebruik /quick-ping.',
    autoSms: false,
    compiled: false as const,
  };
}
export function addVolumeDoublePressListener(_handler: () => void) {
  return { remove: () => undefined };
}
/** Web: geen ACTION_DIAL; JS-laag toont uitleg + nummer. */
export async function openEmergencyDialer(): Promise<boolean> {
  return false;
}
/** Web: geen voorgronddienst. */
export function startAlarmForegroundService(): boolean { return false; }
export function stopAlarmForegroundService(): boolean { return false; }
export function isAlarmForegroundServiceRunning(): boolean { return false; }

export type NativeSmsResult = { ok: boolean; reason?: string };
/** Web: nooit zelf een sms versturen. */
export async function sendSms(_phone: string, _body: string): Promise<NativeSmsResult> {
  return { ok: false, reason: 'unsupported' };
}
export function canSendSms(): boolean { return false; }
export function hasSendSmsPermission(): boolean { return false; }
