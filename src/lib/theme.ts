import { useColorScheme } from 'react-native';
import { useThemePref } from '../store/theme';
import {
  CRITICAL_ACTIONS,
  ResolvedTheme,
  ThemeSkinId,
  normalizeThemeSkinId,
  resolveTheme as resolveThemeBase,
} from './themeCatalog';
import { getDevThemeSkinOverride } from './themeOverride';

/** @deprecated Prefer CRITICAL_ACTIONS — kept for call sites using palette.* */
export const palette = {
  night: '#080F23',
  purple: '#7856FF',
  green: CRITICAL_ACTIONS.green,
  red: CRITICAL_ACTIONS.red,
  orange: CRITICAL_ACTIONS.orange,
  white: '#FFFFFF',
  amber: CRITICAL_ACTIONS.amber,
};

export type Theme = ResolvedTheme;
export { resolveThemeBase as resolveTheme };

/** Legacy export — classic dark/light only (tests / older imports). */
export const themes = {
  dark: resolveThemeBase('classic', true),
  light: resolveThemeBase('classic', false),
};

/** Donker/licht volgens gebruikersvoorkeur (instellingen) of systeem. */
export function useIsDark() {
  const system = useColorScheme();
  const pref = useThemePref((s) => s.pref);
  return pref === 'system' ? system !== 'light' : pref === 'dark';
}

export function useThemeSkinId(): ThemeSkinId {
  const stored = useThemePref((s) => s.skin);
  return getDevThemeSkinOverride() ?? normalizeThemeSkinId(stored);
}

export const useTheme = (): Theme => resolveThemeBase(useThemeSkinId(), useIsDark());
