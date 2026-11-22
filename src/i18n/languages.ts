/** App languages. Dutch is the source language and the fallback. */
export const APP_LANGS = ['nl', 'en', 'de', 'fr', 'es', 'tr', 'ar', 'pl'] as const;
export type AppLang = (typeof APP_LANGS)[number];

export type LangPref = 'system' | AppLang;
export type RegionPref = 'system' | string;

export const LANGUAGE_CHOICES: readonly { id: AppLang; nativeName: string; rtl: boolean }[] = [
  { id: 'nl', nativeName: 'Nederlands', rtl: false },
  { id: 'en', nativeName: 'English', rtl: false },
  { id: 'de', nativeName: 'Deutsch', rtl: false },
  { id: 'fr', nativeName: 'Français', rtl: false },
  { id: 'es', nativeName: 'Español', rtl: false },
  { id: 'tr', nativeName: 'Türkçe', rtl: false },
  { id: 'ar', nativeName: 'العربية', rtl: true },
  { id: 'pl', nativeName: 'Polski', rtl: false },
];

export function isAppLang(value: string | null | undefined): value is AppLang {
  return !!value && (APP_LANGS as readonly string[]).includes(value);
}

/** BCP-47 primary language, ignoring region and script. */
export function primaryLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return base || null;
}

/**
 * Resolve the UI language.
 * Unsupported system languages fall back to Dutch (the source language).
 */
export function resolveLanguage(pref: LangPref, deviceLanguage: string | null | undefined): AppLang {
  if (pref !== 'system') return pref;
  const base = primaryLanguage(deviceLanguage);
  return isAppLang(base) ? base : 'nl';
}

export function isRtlLanguage(lang: string | null | undefined): boolean {
  return lang === 'ar';
}

/** Speech-synthesis locale for the fake-call voice. */
export function speechLocale(lang: AppLang): string {
  switch (lang) {
    case 'nl': return 'nl-NL';
    case 'en': return 'en-US';
    case 'de': return 'de-DE';
    case 'fr': return 'fr-FR';
    case 'es': return 'es-ES';
    case 'tr': return 'tr-TR';
    case 'ar': return 'ar-SA';
    case 'pl': return 'pl-PL';
  }
}
