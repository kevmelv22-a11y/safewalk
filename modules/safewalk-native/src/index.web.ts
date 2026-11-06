export function isVolumeDoublePressSupported() { return false; }
export function setVolumeDoublePressEnabled(_enabled: boolean) { /* no-op */ }
export function getNativeCapabilities() {
  return {
    volumeDoublePress: false,
    backgroundTorch: false,
    notes: 'Web: geen native volume/tile. Gebruik /quick-ping.',
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
