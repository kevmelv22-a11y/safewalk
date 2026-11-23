import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCountryCode } from './countries';
import { isAppLang, type LangPref, type RegionPref } from './languages';

export const LANG_PREF_KEY = 'safewalk.uiLanguage.v1';
export const REGION_PREF_KEY = 'safewalk.region.v1';

export async function loadLanguagePreference(): Promise<LangPref> {
  try {
    const raw = await AsyncStorage.getItem(LANG_PREF_KEY);
    if (raw === 'system') return 'system';
    if (isAppLang(raw)) return raw;
  } catch { /* keep default */ }
  return 'system';
}

export async function saveLanguagePreference(pref: LangPref): Promise<void> {
  await AsyncStorage.setItem(LANG_PREF_KEY, pref);
}

export async function loadRegionPreference(): Promise<RegionPref> {
  try {
    const raw = await AsyncStorage.getItem(REGION_PREF_KEY);
    if (!raw || raw === 'system') return 'system';
    const code = raw.toUpperCase();
    if (isCountryCode(code)) return code;
  } catch { /* keep default */ }
  return 'system';
}

export async function saveRegionPreference(pref: RegionPref): Promise<void> {
  await AsyncStorage.setItem(REGION_PREF_KEY, pref === 'system' ? 'system' : pref.toUpperCase());
}

export function resolveRegion(pref: RegionPref, deviceRegion: string | null | undefined): string | null {
  if (pref !== 'system') return pref.toUpperCase();
  if (!deviceRegion) return null;
  const code = deviceRegion.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
