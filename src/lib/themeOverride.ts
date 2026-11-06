import { ThemeSkinId, isThemeSkinId, normalizeThemeSkinId } from './themeCatalog';

/** Dev-only ephemeral override (not persisted). Cleared whenever the store skin is set. */
let devOverride: ThemeSkinId | null = null;

export function setDevThemeSkinOverride(id: string | null | undefined) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    devOverride = id == null || id === '' ? null : normalizeThemeSkinId(id);
  }
}

export function clearDevThemeSkinOverride() {
  devOverride = null;
}

export function getDevThemeSkinOverride(): ThemeSkinId | null {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return devOverride;
  return null;
}

/** Accepts string or Expo Router string[] search params. */
export function parseThemeQueryParam(v: unknown): ThemeSkinId | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string' || !raw) return null;
  const id = raw.trim().toLowerCase();
  return isThemeSkinId(id) ? id : null;
}
