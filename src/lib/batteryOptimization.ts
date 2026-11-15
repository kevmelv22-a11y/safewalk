import { Linking, Platform } from 'react-native';

export const BATTERY_HINT_ANDROID_NL =
  'Sommige telefoons zetten SafeWalk stil als het scherm uit is, ook met een zichtbare melding. Zet accu-optimalisatie voor SafeWalk uit in de instellingen van je telefoon als je locatie wilt blijven delen. SafeWalk kan dit niet zelf afdwingen, en delen is daarmee niet gegarandeerd.';

export const BATTERY_HINT_IOS_NL =
  'Op iPhone kan een laagenergie-stand locatie-updates beperken. Laat SafeWalk open of in de app-wisselaar staan tijdens je reis. Delen met het scherm uit is niet gegarandeerd.';

export const BATTERY_HINT_NL = Platform.OS === 'ios' ? BATTERY_HINT_IOS_NL : BATTERY_HINT_ANDROID_NL;

export type BatterySettingsDeps = {
  platform?: string;
  sendIntent?: (action: string) => Promise<unknown>;
  openSettings?: () => Promise<unknown>;
};

/** Opent de accu-instellingen (Android: lijst accu-optimalisatie). De gebruiker moet zelf SafeWalk uitzonderen. */
export async function openBatteryOptimizationSettings(deps?: BatterySettingsDeps): Promise<boolean> {
  const platform = deps?.platform ?? Platform.OS;
  const openSettings = deps?.openSettings ?? (() => Linking.openSettings());
  const sendIntent = deps?.sendIntent ?? ((action: string) => Linking.sendIntent(action));
  try {
    if (platform === 'android') {
      try {
        await sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
        return true;
      } catch {
        await openSettings();
        return true;
      }
    }
    await openSettings();
    return true;
  } catch {
    return false;
  }
}
