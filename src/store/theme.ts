import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THEME_SKIN, ThemeSkinId, normalizeThemeSkinId } from '../lib/themeCatalog';
import { clearDevThemeSkinOverride, parseThemeQueryParam } from '../lib/themeOverride';

/** Legacy light/dark preference — preserved. */
export type ThemePref = 'system' | 'dark' | 'light';

export function normalizePref(v: unknown): ThemePref {
  return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
}

type S = {
  pref: ThemePref;
  skin: ThemeSkinId;
  /** True after AsyncStorage rehydration finishes (also true immediately if nothing to load). */
  _hasHydrated: boolean;
  setPref: (p: ThemePref) => void;
  setSkin: (s: ThemeSkinId) => void;
};

export type ThemePersistedSlice = { pref?: unknown; skin?: unknown };

/**
 * Merge persisted JSON into current store state.
 * - When storage has a skin, that wins (survives reload).
 * - When storage lacks `skin` (legacy `{ pref }` only), keeps in-memory `current.skin`
 *   so a ?theme= apply that raced ahead of hydration is not wiped by DEFAULT galaxy.
 */
export function mergeThemeState(
  persisted: unknown,
  current: Pick<S, 'pref' | 'skin' | '_hasHydrated'> & Partial<S>,
): Pick<S, 'pref' | 'skin' | '_hasHydrated'> {
  const p = (persisted ?? {}) as ThemePersistedSlice;
  const hasPersistedSkin = typeof p.skin === 'string' && p.skin.length > 0;
  return {
    pref: normalizePref(p.pref ?? current.pref),
    skin: hasPersistedSkin
      ? normalizeThemeSkinId(p.skin)
      : normalizeThemeSkinId(current.skin),
    _hasHydrated: true,
  };
}

/**
 * Persisted appearance. Storage key `safewalk.theme`.
 * Skin changes clear any ephemeral dev override so the UI picker always wins.
 */
export const useThemePref = create<S>()(
  persist(
    (set) => ({
      pref: 'system',
      skin: DEFAULT_THEME_SKIN,
      _hasHydrated: false,
      setPref: (pref) => set({ pref: normalizePref(pref) }),
      setSkin: (skin) => {
        clearDevThemeSkinOverride();
        set({ skin: normalizeThemeSkinId(skin) });
      },
    }),
    {
      name: 'safewalk.theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pref: s.pref, skin: s.skin }),
      merge: (persisted, current) => ({
        ...current,
        ...mergeThemeState(persisted, current),
      }),
      onRehydrateStorage: () => (_state, error) => {
        void _state;
        void error;
        useThemePref.setState({ _hasHydrated: true });
      },
    },
  ),
);

/** Resolves when persist finished reading AsyncStorage (safe to apply ?theme= / trust skin). */
export function whenThemeHydrated(): Promise<void> {
  if (useThemePref.persist.hasHydrated() || useThemePref.getState()._hasHydrated) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      useThemePref.setState({ _hasHydrated: true });
      resolve();
    };
    const unsub = useThemePref.persist.onFinishHydration(() => {
      unsub();
      done();
    });
    if (useThemePref.persist.hasHydrated()) {
      unsub();
      done();
    }
    // Never block deep-link / picker apply if storage is stuck
    setTimeout(() => {
      unsub();
      done();
    }, 2000);
  });
}

/** Apply a skin from a URL/search param after hydration. Persists via setSkin. */
export async function applyThemeSkinFromQuery(raw: unknown): Promise<ThemeSkinId | null> {
  const id = parseThemeQueryParam(raw);
  if (!id) return null;
  await whenThemeHydrated();
  useThemePref.getState().setSkin(id);
  return id;
}
