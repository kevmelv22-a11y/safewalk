import { ThemeSkinId, isThemeSkinId, normalizeThemeSkinId } from './themeCatalog';

/** Dev-only ephemeral override (not persisted). Production always null. */
let devOverride: ThemeSkinId | null = null;

export function setDevThemeSkinOverride(id: string | null | undefined) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    devOverride = id == null || id === '' ? null : normalizeThemeSkinId(id);
  }
}

export function getDevThemeSkinOverride(): ThemeSkinId | null {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return devOverride;
  return null;
}

export function parseThemeQueryParam(v: unknown): ThemeSkinId | null {
  if (typeof v !== 'string' || !v) return null;
  return isThemeSkinId(v) ? v : null;
}
