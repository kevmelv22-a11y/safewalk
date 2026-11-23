import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, I18nManager, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import { i18n } from './index';
import {
  isAppLang, isRtlLanguage, resolveLanguage, type AppLang, type LangPref, type RegionPref,
} from './languages';
import { isCountryCode } from './countries';
import { loadLanguagePreference, loadRegionPreference, resolveRegion, saveLanguagePreference, saveRegionPreference } from './prefs';
import { rtlRestartNeeded } from './rtl';
import { emergencyDirectory } from './emergency';
import { screenshotMode } from '../lib/screenshotMode';

type LocaleContextValue = {
  ready: boolean;
  preference: LangPref;
  language: AppLang;
  regionPreference: RegionPref;
  /** Resolved ISO region, or null when unknown. */
  region: string | null;
  /** Digits for the main emergency button. */
  emergencyDigits: string;
  setLanguage: (pref: LangPref) => Promise<{ restartNeeded: boolean }>;
  setRegion: (pref: RegionPref) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const rtlAtLaunch = I18nManager.isRTL;

function queryOverride(): { lang: AppLang | null; region: string | null } {
  if (!screenshotMode || typeof window === 'undefined') return { lang: null, region: null };
  const q = new URLSearchParams(window.location.search);
  const lang = q.get('lang');
  const region = q.get('region');
  return {
    lang: isAppLang(lang) ? lang : null,
    region: region && isCountryCode(region.toUpperCase()) ? region.toUpperCase() : null,
  };
}

function deviceLocale(): { language: string | null; region: string | null } {
  try {
    const loc = getLocales()[0];
    return { language: loc?.languageCode ?? null, region: loc?.regionCode ?? null };
  } catch {
    return { language: null, region: null };
  }
}

function applyWebDirection(rtl: boolean, lang: AppLang) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

/** Runtime direction. On web this updates immediately. On native a restart is required. */
export function applyDirection(rtl: boolean): { restartNeeded: boolean } {
  I18nManager.allowRTL(true);
  if (Platform.OS === 'web') {
    I18nManager.forceRTL(rtl);
    return { restartNeeded: false };
  }
  I18nManager.forceRTL(rtl);
  return { restartNeeded: rtlRestartNeeded({ platform: Platform.OS, nextRtl: rtl, rtlAtLaunch }) };
}

const runtimeEmergency = { digits: '112' };
/** Sync read for SMS builders. Updated by the locale provider. */
export function emergencyDigitsNow(): string {
  return runtimeEmergency.digits;
}
function rememberEmergencyDigits(digits: string) {
  runtimeEmergency.digits = digits;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const boot = queryOverride();
  const device = deviceLocale();
  const [preference, setPreference] = useState<LangPref>(boot.lang ?? 'system');
  const [regionPreference, setRegionPreference] = useState<RegionPref>(boot.region ?? 'system');
  const [ready, setReady] = useState(false);
  const language = boot.lang ?? resolveLanguage(preference, device.language);
  const digits = emergencyDirectory(boot.region ?? resolveRegion(regionPreference, device.region)).primary.digits;

  useLayoutEffect(() => {
    rememberEmergencyDigits(digits);
    const rtl = isRtlLanguage(language);
    applyDirection(rtl);
    applyWebDirection(rtl, language);
    void i18n.changeLanguage(language);
  }, [digits, language]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (boot.lang || boot.region) {
        if (!cancel) setReady(true);
        return;
      }
      const [langPref, regionPref] = await Promise.all([loadLanguagePreference(), loadRegionPreference()]);
      if (cancel) return;
      setPreference(langPref);
      setRegionPreference(regionPref);
      const resolved = resolveLanguage(langPref, deviceLocale().language);
      await i18n.changeLanguage(resolved);
      const rtl = isRtlLanguage(resolved);
      applyDirection(rtl);
      applyWebDirection(rtl, resolved);
      setReady(true);
    })();
    return () => { cancel = true; };
  }, [boot.lang, boot.region]);

  const setLanguage = useCallback(async (pref: LangPref) => {
    setPreference(pref);
    await saveLanguagePreference(pref);
    const resolved = resolveLanguage(pref, deviceLocale().language);
    await i18n.changeLanguage(resolved);
    const rtl = isRtlLanguage(resolved);
    const { restartNeeded } = applyDirection(rtl);
    applyWebDirection(rtl, resolved);
    if (restartNeeded) {
      Alert.alert(i18n.t('language.restartTitle'), i18n.t('language.restartBody'));
    }
    return { restartNeeded };
  }, []);

  const setRegion = useCallback(async (pref: RegionPref) => {
    setRegionPreference(pref);
    await saveRegionPreference(pref);
  }, []);

  const directory = emergencyDirectory(boot.region ?? resolveRegion(regionPreference, device.region));

  const value = useMemo<LocaleContextValue>(() => ({
    ready,
    preference: boot.lang ?? preference,
    language: boot.lang ?? resolveLanguage(preference, device.language),
    regionPreference: boot.region ?? regionPreference,
    region: boot.region ?? resolveRegion(regionPreference, device.region),
    emergencyDigits: directory.primary.digits,
    setLanguage,
    setRegion,
  }), [ready, preference, regionPreference, boot.lang, boot.region, device.language, device.region, directory.primary.digits, setLanguage, setRegion]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    const lang = (isAppLang(i18n.language) ? i18n.language : 'nl') as AppLang;
    const directory = emergencyDirectory(null);
    return {
      ready: true,
      preference: 'system',
      language: lang,
      regionPreference: 'system',
      region: null,
      emergencyDigits: directory.primary.digits,
      setLanguage: async () => ({ restartNeeded: false }),
      setRegion: async () => undefined,
    };
  }
  return ctx;
}
