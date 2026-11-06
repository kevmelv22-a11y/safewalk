import {
  DEFAULT_THEME_SKIN,
  resolveTheme,
  THEME_SKINS,
} from '../src/lib/themeCatalog';
import { contrastRatio, meetsWcagAa } from '../src/lib/themeContrast';
import {
  clearDevThemeSkinOverride,
  getDevThemeSkinOverride,
  parseThemeQueryParam,
  setDevThemeSkinOverride,
} from '../src/lib/themeOverride';
import { mergeThemeState, normalizePref } from '../src/store/theme';
import { resolveButtonChrome } from '../src/components/ui';

describe('parseThemeQueryParam', () => {
  it('accepteert string en Expo string[]', () => {
    expect(parseThemeQueryParam('halloween')).toBe('halloween');
    expect(parseThemeQueryParam(['kerst'])).toBe('kerst');
    expect(parseThemeQueryParam('Sinterklaas')).toBe('sinterklaas');
    expect(parseThemeQueryParam('nope')).toBeNull();
    expect(parseThemeQueryParam(undefined)).toBeNull();
    expect(parseThemeQueryParam([])).toBeNull();
  });
});

describe('mergeThemeState hydration', () => {
  it('behoudt persisted seasonal skin (Galaxy-default overschrijft niet)', () => {
    const merged = mergeThemeState(
      { pref: 'system', skin: 'halloween' },
      { pref: 'system', skin: DEFAULT_THEME_SKIN, _hasHydrated: false },
    );
    expect(merged.skin).toBe('halloween');
    expect(merged._hasHydrated).toBe(true);
  });

  it('legacy { pref } zonder skin: behoudt in-memory skin (query-race)', () => {
    const merged = mergeThemeState(
      { pref: 'dark' },
      { pref: 'system', skin: 'kerst', _hasHydrated: false },
    );
    expect(merged.skin).toBe('kerst');
    expect(merged.pref).toBe('dark');
  });

  it('lege storage: houdt current (default Galaxy op verse install)', () => {
    const merged = mergeThemeState(
      null,
      { pref: 'system', skin: DEFAULT_THEME_SKIN, _hasHydrated: false },
    );
    expect(merged.skin).toBe('galaxy');
  });

  it('normalizePref valt terug op system', () => {
    expect(normalizePref('nope')).toBe('system');
    expect(normalizePref('light')).toBe('light');
  });
});

describe('dev override vs picker', () => {
  afterEach(() => clearDevThemeSkinOverride());

  it('setDev override werkt alleen in __DEV__; clear wist het', () => {
    // In Jest __DEV__ is typically true under RN preset; clear must always work
    clearDevThemeSkinOverride();
    expect(getDevThemeSkinOverride()).toBeNull();
    setDevThemeSkinOverride('halloween');
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      expect(getDevThemeSkinOverride()).toBe('halloween');
    }
    clearDevThemeSkinOverride();
    expect(getDevThemeSkinOverride()).toBeNull();
  });
});

describe('ThemeBackdrop skin → decoration', () => {
  it('seizoensskins leveren geen galaxy-decoration', () => {
    expect(resolveTheme('halloween', false).decoration).toBe('halloween');
    expect(resolveTheme('kerst', false).decoration).toBe('kerst');
    expect(resolveTheme('sinterklaas', false).decoration).toBe('sinterklaas');
    expect(resolveTheme('galaxy', false).decoration).toBe('galaxy');
    expect(THEME_SKINS.halloween.decoration).not.toBe('galaxy');
  });
});

describe('resolveButtonChrome disabled', () => {
  const t = resolveTheme('galaxy', true);

  it('disabled primary houdt witte labelkleur (geen opacity-dim)', () => {
    const on = resolveButtonChrome(t, 'primary', false);
    const off = resolveButtonChrome(t, 'primary', true);
    expect(off.label).toBe('#FFFFFF');
    expect(off.bg).toBe(t.purple);
    expect(meetsWcagAa(off.label, off.bg) || contrastRatio(off.label, off.bg) >= 3).toBe(true);
    expect(on.label).toBe('#FFFFFF');
  });

  it('disabled secondary gebruikt muted op field met AA', () => {
    const off = resolveButtonChrome(t, 'secondary', true);
    expect(off.label).toBe(t.muted);
    expect(off.bg).toBe(t.field);
    expect(meetsWcagAa(off.label, off.bg)).toBe(true);
  });
});

describe('placeholder op echte field surface', () => {
  it('elke resolved skin: placeholder vs field ≥ 4.5', () => {
    for (const id of Object.keys(THEME_SKINS) as (keyof typeof THEME_SKINS)[]) {
      for (const dark of [true, false]) {
        const r = resolveTheme(id, dark);
        expect(contrastRatio(r.placeholder, r.field)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
