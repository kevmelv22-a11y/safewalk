import { useColorScheme } from 'react-native';
import { useThemePref } from '../store/theme';

export const palette = { night: '#080F23', purple: '#7856FF', green: '#22C55E', red: '#EF4444', white: '#FFFFFF', amber: '#F59E0B' };

export const themes = {
  dark: { bg: palette.night, card: '#121A33', text: palette.white, muted: '#A5ADC8', border: '#26304F', ...palette },
  light: { bg: '#F5F6FB', card: palette.white, text: palette.night, muted: '#4A5272', border: '#DADFEA', ...palette },
};
export type Theme = typeof themes.dark;
/** Donker/licht volgens gebruikersvoorkeur (instellingen) of systeem. */
export function useIsDark() {
  const system = useColorScheme(); const pref = useThemePref((s) => s.pref);
  return pref === 'system' ? system !== 'light' : pref === 'dark';
}
export const useTheme = (): Theme => (useIsDark() ? themes.dark : themes.light);
