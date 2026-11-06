import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THEME_SKIN, ThemeSkinId, normalizeThemeSkinId } from '../lib/themeCatalog';

/** Legacy light/dark preference — preserved. */
export type ThemePref = 'system' | 'dark' | 'light';

function normalizePref(v: unknown): ThemePref {
  return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
}

type S = {
  pref: ThemePref;
  skin: ThemeSkinId;
  setPref: (p: ThemePref) => void;
  setSkin: (s: ThemeSkinId) => void;
};

/**
 * Persisted appearance. Migrates older `{ pref }` payloads by defaulting `skin` to classic.
 * Storage key stays `safewalk.theme` so existing installs keep their light/dark choice.
 */
export const useThemePref = create<S>()(
  persist(
    (set) => ({
      pref: 'system',
      skin: DEFAULT_THEME_SKIN,
      setPref: (pref) => set({ pref: normalizePref(pref) }),
      setSkin: (skin) => set({ skin: normalizeThemeSkinId(skin) }),
    }),
    {
      name: 'safewalk.theme',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<S>;
        return {
          ...current,
          ...p,
          pref: normalizePref(p.pref ?? current.pref),
          skin: normalizeThemeSkinId(p.skin ?? current.skin),
        };
      },
    },
  ),
);
