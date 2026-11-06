import {
  CRITICAL_ACTIONS,
  DEFAULT_THEME_SKIN,
  THEME_SKIN_IDS,
  THEME_SKINS,
  listThemeSkins,
  normalizeThemeSkinId,
  resolveTheme,
} from '../src/lib/themeCatalog';
import { contrastRatio, meetsWcagAa, relativeLuminance } from '../src/lib/themeContrast';
import { parseThemeQueryParam } from '../src/lib/themeOverride';

describe('theme catalog', () => {
  it('bevat verplichte skins', () => {
    for (const id of THEME_SKIN_IDS) {
      expect(THEME_SKINS[id].label.length).toBeGreaterThan(2);
      expect(THEME_SKINS[id].swatches).toHaveLength(3);
      expect(THEME_SKINS[id].dark.field).toBeTruthy();
      expect(THEME_SKINS[id].dark.placeholder).toBeTruthy();
    }
    expect(listThemeSkins()).toHaveLength(THEME_SKIN_IDS.length);
    expect(DEFAULT_THEME_SKIN).toBe('galaxy');
  });

  it('valt terug op galaxy bij onbekende skin', () => {
    expect(normalizeThemeSkinId('nope')).toBe('galaxy');
    expect(normalizeThemeSkinId(undefined)).toBe('galaxy');
  });

  it('immersieve skins forceren donkere surfaces ook bij preferDark=false', () => {
    for (const id of THEME_SKIN_IDS) {
      const def = THEME_SKINS[id];
      if (!def.immersive) continue;
      const t = resolveTheme(id, false);
      expect(t.isDark).toBe(true);
      expect(t.card).toBe(def.dark.card);
      expect(t.bg).toBe(def.dark.bg);
      expect(t.field).toBe(def.dark.field);
    }
    const classicLight = resolveTheme('classic', false);
    expect(classicLight.isDark).toBe(false);
    expect(classicLight.card).toBe(THEME_SKINS.classic.light.card);
  });

  it('houdt kritieke actiekleuren invariant', () => {
    for (const id of THEME_SKIN_IDS) {
      for (const dark of [true, false]) {
        const t = resolveTheme(id, dark);
        expect(t.red).toBe(CRITICAL_ACTIONS.red);
        expect(t.orange).toBe(CRITICAL_ACTIONS.orange);
        expect(t.green).toBe(CRITICAL_ACTIONS.green);
      }
    }
  });

  it('resolved card/field foreground contrast AA (≥4.5) — text, muted, placeholder', () => {
    for (const id of THEME_SKIN_IDS) {
      for (const preferDark of [true, false]) {
        const t = resolveTheme(id, preferDark);
        // AuthPanel / Card surfaces
        expect(meetsWcagAa(t.text, t.card)).toBe(true);
        expect(meetsWcagAa(t.muted, t.card)).toBe(true);
        expect(contrastRatio(t.text, t.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.muted, t.card)).toBeGreaterThanOrEqual(4.5);
        // Field / input
        expect(meetsWcagAa(t.text, t.field)).toBe(true);
        expect(meetsWcagAa(t.placeholder, t.field)).toBe(true);
        expect(contrastRatio(t.placeholder, t.field)).toBeGreaterThanOrEqual(4.5);
        // Screen bg
        expect(meetsWcagAa(t.text, t.bg)).toBe(true);
        // Secondary button: text on field
        expect(meetsWcagAa(t.text, t.field)).toBe(true);
      }
    }
  });

  it('grote veiligheidsknoppen wit-op-kleur ≥3:1', () => {
    for (const bg of [CRITICAL_ACTIONS.red, CRITICAL_ACTIONS.orange, CRITICAL_ACTIONS.green]) {
      expect(contrastRatio('#FFFFFF', bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('Galaxy gebruikt SnapShot X nachtkleuren + solid dark card', () => {
    const g = resolveTheme('galaxy', false);
    expect(g.bg).toBe('#08090E');
    expect(g.card).toBe('#1A1425');
    expect(g.field).toBe('#241C33');
    expect(g.immersive).toBe(true);
    expect(relativeLuminance(g.card)).toBeLessThan(0.12);
  });

  it('Halloween/Kerst/Sinterklaas zijn donker immersief (geen pastel light cards)', () => {
    for (const id of ['halloween', 'kerst', 'sinterklaas'] as const) {
      const t = resolveTheme(id, false);
      expect(t.isDark).toBe(true);
      expect(t.immersive).toBe(true);
      expect(relativeLuminance(t.card)).toBeLessThan(0.15);
      expect(relativeLuminance(t.bg)).toBeLessThan(0.08);
      expect(relativeLuminance(t.field)).toBeLessThan(0.2);
    }
  });
});

describe('theme override helpers', () => {
  it('parseert alleen bekende query-ids', () => {
    expect(parseThemeQueryParam('galaxy')).toBe('galaxy');
    expect(parseThemeQueryParam('nope')).toBeNull();
  });
});
