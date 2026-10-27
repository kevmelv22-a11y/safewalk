import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePref = 'system' | 'dark' | 'light';
type S = { pref: ThemePref; setPref: (p: ThemePref) => void };
export const useThemePref = create<S>()(persist((set) => ({ pref: 'system', setPref: (pref) => set({ pref }) }),
  { name: 'safewalk.theme', storage: createJSONStorage(() => AsyncStorage) }));
