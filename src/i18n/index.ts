import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from './messages/ar';
import { de } from './messages/de';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { nl } from './messages/nl';
import { pl } from './messages/pl';
import { tr } from './messages/tr';
import { isAppLang, type AppLang } from './languages';

export const resources = {
  nl: { translation: nl },
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  tr: { translation: tr },
  ar: { translation: ar },
  pl: { translation: pl },
} as const;

// i18next's default export is the instance; `.use` is the plugin API, not the named `use` export.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: resources as never,
  lng: 'nl',
  fallbackLng: 'nl',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function currentLang(): AppLang {
  const lang = i18n.resolvedLanguage || i18n.language;
  return isAppLang(lang) ? lang : 'nl';
}

export { i18n };
export { nl };
