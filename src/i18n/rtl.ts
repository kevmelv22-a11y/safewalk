/**
 * Whether a native layout restart is required after a direction change.
 * Web applies `dir` immediately. iOS and Android keep the direction from process start
 * until the app is opened again (I18nManager.forceRTL does not relayout the current process).
 */
export function rtlRestartNeeded(o: { platform: string; nextRtl: boolean; rtlAtLaunch: boolean }): boolean {
  if (o.platform === 'web') return false;
  return o.nextRtl !== o.rtlAtLaunch;
}
