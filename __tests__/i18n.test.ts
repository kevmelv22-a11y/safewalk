import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n, resources } from '../src/i18n';
import { APP_LANGS, isRtlLanguage, resolveLanguage, type AppLang } from '../src/i18n/languages';
import { rtlRestartNeeded } from '../src/i18n/rtl';
import { emergencyDirectory, showsDutchHelplines } from '../src/i18n/emergency';
import { LANG_PREF_KEY, loadLanguagePreference, resolveRegion, saveLanguagePreference, saveRegionPreference } from '../src/i18n/prefs';
import { openEmergencyNumber } from '../src/lib/dial112';

const BANNED = [
  /gegarandeerd veilig/i,
  /guaranteed(ly)? safe/i,
  /garantiert sicher/i,
  /sécurité garantie/i,
  /totalement sûr/i,
  /garantizado(?:s)? segur/i,
  /garanti güvenli/i,
  /gwarantowan\w* bezpiecze/i,
  /آمن مضمون/,
];

function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) leaves(v, out);
  }
  return out;
}

function paths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    const next = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? paths(v, next) : [next];
  });
}

describe('language switching', () => {
  afterEach(async () => {
    await i18n.changeLanguage('nl');
    await AsyncStorage.clear();
  });

  it('defaults to Dutch and switches immediately', async () => {
    expect(i18n.t('settings.title')).toBe('Instellingen');
    await i18n.changeLanguage('en');
    expect(i18n.t('settings.title')).toBe('Settings');
    await i18n.changeLanguage('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
    await i18n.changeLanguage('ar');
    expect(i18n.t('settings.title')).toBe('الإعدادات');
    await i18n.changeLanguage('nl');
    expect(i18n.t('settings.title')).toBe('Instellingen');
  });

  it('resolves the system language and falls back to Dutch', () => {
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'pl')).toBe('pl');
    expect(resolveLanguage('system', 'ja')).toBe('nl');
    expect(resolveLanguage('system', null)).toBe('nl');
    expect(resolveLanguage('tr', 'en')).toBe('tr');
  });

  it('persists the language preference', async () => {
    await saveLanguagePreference('fr');
    expect(await AsyncStorage.getItem(LANG_PREF_KEY)).toBe('fr');
    expect(await loadLanguagePreference()).toBe('fr');
    await saveLanguagePreference('system');
    expect(await loadLanguagePreference()).toBe('system');
  });

  it('keeps the same keys in every language and avoids safety promises', () => {
    const nlKeys = paths(resources.nl.translation).sort();
    for (const lang of APP_LANGS) {
      expect(paths(resources[lang].translation).sort()).toEqual(nlKeys);
      const blob = leaves(resources[lang].translation).join('\n');
      for (const banned of BANNED) expect(blob).not.toMatch(banned);
    }
  });
});

describe('RTL flag', () => {
  it('is on only for Arabic', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    for (const lang of APP_LANGS.filter((l) => l !== 'ar')) expect(isRtlLanguage(lang)).toBe(false);
  });

  it('asks for a native restart and applies web immediately', () => {
    expect(rtlRestartNeeded({ platform: 'ios', nextRtl: true, rtlAtLaunch: false })).toBe(true);
    expect(rtlRestartNeeded({ platform: 'android', nextRtl: false, rtlAtLaunch: true })).toBe(true);
    expect(rtlRestartNeeded({ platform: 'ios', nextRtl: true, rtlAtLaunch: true })).toBe(false);
    expect(rtlRestartNeeded({ platform: 'web', nextRtl: true, rtlAtLaunch: false })).toBe(false);
  });
});

describe('emergency number lookup', () => {
  it('shows Dutch helplines only for NL', () => {
    const nl = emergencyDirectory('NL');
    expect(nl.known).toBe(true);
    expect(nl.fallback).toBe(false);
    expect(nl.primary.digits).toBe('112');
    const ids = nl.lines.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['112', 'politie', 'veilig-thuis', '113', 'kindertelefoon']));
    expect(showsDutchHelplines('nl')).toBe(true);
  });

  it('uses national numbers outside the EU and hides Dutch lines', () => {
    const us = emergencyDirectory('US');
    expect(us.primary.digits).toBe('911');
    expect(us.fallback).toBe(false);
    expect(us.lines.map((l) => l.id)).not.toContain('veilig-thuis');
    expect(showsDutchHelplines('US')).toBe(false);
    expect(emergencyDirectory('CA').primary.digits).toBe('911');
    expect(emergencyDirectory('GB').primary.digits).toBe('999');
    expect(emergencyDirectory('GB').lines.map((l) => l.digits)).toContain('112');
    expect(emergencyDirectory('AU').primary.digits).toBe('000');
    expect(emergencyDirectory('NZ').primary.digits).toBe('111');
    expect(emergencyDirectory('DE').primary.digits).toBe('112');
    expect(emergencyDirectory('DE').lines.map((l) => l.digits)).toContain('110');
    expect(emergencyDirectory('DE').lines.map((l) => l.id)).not.toContain('veilig-thuis');
    expect(emergencyDirectory('PL').primary.digits).toBe('112');
    expect(emergencyDirectory('TR').primary.digits).toBe('112');
    expect(emergencyDirectory('FR').primary.digits).toBe('112');
  });

  it('falls back to 112 with an explicit unknown-region note', () => {
    const unknown = emergencyDirectory(null);
    expect(unknown.known).toBe(false);
    expect(unknown.fallback).toBe(true);
    expect(unknown.primary.digits).toBe('112');
    expect(unknown.noteKey).toBe('emergency.notes.unknown');
    const mystery = emergencyDirectory('ZZ');
    expect(mystery.fallback).toBe(true);
    expect(mystery.primary.digits).toBe('112');
    for (const lang of APP_LANGS) {
      const note = String(i18n.t('emergency.notes.unknown', { lng: lang }));
      expect(note.length).toBeGreaterThan(40);
      expect(note.toLowerCase()).not.toMatch(/gegarandeerd veilig|guaranteed safe|garantiert sicher/);
    }
  });

  it('does not use the hardcoded 112 dialer for 911', async () => {
    const androidActionDial = jest.fn(async () => undefined);
    const openURL = jest.fn(async () => undefined);
    const r = await openEmergencyNumber('911', { platform: 'ios', openURL, androidActionDial });
    expect(r).toEqual({ ok: true, method: 'ios_tel' });
    expect(openURL).toHaveBeenCalledWith('tel:911');
    expect(androidActionDial).not.toHaveBeenCalled();
  });

  it('resolves a saved country over the device region', async () => {
    expect(resolveRegion('system', 'US')).toBe('US');
    expect(resolveRegion('DE', 'US')).toBe('DE');
    expect(resolveRegion('system', null)).toBeNull();
    await saveRegionPreference('PL');
    expect(await AsyncStorage.getItem('safewalk.region.v1')).toBe('PL');
  });
});

describe('catalog languages', () => {
  it('includes the eight supported languages', () => {
    const langs = Object.keys(resources) as AppLang[];
    expect(langs.sort()).toEqual([...APP_LANGS].sort());
  });
});
