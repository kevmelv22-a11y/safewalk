import {
  CRITICAL_ACTIONS,
  DEFAULT_THEME_SKIN,
  THEME_SKIN_IDS,
  THEME_SKINS,
  listThemeSkins,
  normalizeThemeSkinId,
  resolveTheme,
  surfacesFor,
} from '../src/lib/themeCatalog';
import { contrastRatio, meetsWcagAa } from '../src/lib/themeContrast';
import { parseThemeQueryParam } from '../src/lib/themeOverride';

describe('theme catalog', () => {
  it('bevat verplichte skins inclusief Galaxy/Halloween/Kerst/Sinterklaas', () => {
    for (const id of ['classic', 'galaxy', 'halloween', 'kerst', 'sinterklaas', 'noorderlicht', 'oceaan', 'zonsondergang'] as const) {
      expect(THEME_SKIN_IDS).toContain(id);
      expect(THEME_SKINS[id].label.length).toBeGreaterThan(2);
      expect(THEME_SKINS[id].swatches).toHaveLength(3);
    }
    expect(listThemeSkins()).toHaveLength(THEME_SKIN_IDS.length);
  });

  it('valt terug op classic bij onbekende skin', () => {
    expect(normalizeThemeSkinId('nope')).toBe(DEFAULT_THEME_SKIN);
    expect(normalizeThemeSkinId(undefined)).toBe('classic');
    expect(normalizeThemeSkinId(null)).toBe('classic');
    expect(normalizeThemeSkinId('galaxy')).toBe('galaxy');
  });

  it('houdt kritieke actiekleuren invariant over alle skins', () => {
    for (const id of THEME_SKIN_IDS) {
      for (const dark of [true, false]) {
        const t = resolveTheme(id, dark);
        expect(t.red).toBe(CRITICAL_ACTIONS.red);
        expect(t.orange).toBe(CRITICAL_ACTIONS.orange);
        expect(t.green).toBe(CRITICAL_ACTIONS.green);
        expect(t.amber).toBe(CRITICAL_ACTIONS.amber);
        expect(t.skinId).toBe(id);
      }
    }
  });

  it('haalt WCAG AA (≥4.5) voor normale tekst op bg en card', () => {
    for (const id of THEME_SKIN_IDS) {
      for (const dark of [true, false]) {
        const s = surfacesFor(id, dark);
        expect(meetsWcagAa(s.text, s.bg)).toBe(true);
        expect(meetsWcagAa(s.text, s.card)).toBe(true);
        expect(meetsWcagAa(s.muted, s.bg)).toBe(true);
        expect(contrastRatio(s.text, s.bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('grote veiligheidsknoppen (wit op rood/oranje/groen) halen ≥3:1 voor large text', () => {
    for (const bg of [CRITICAL_ACTIONS.red, CRITICAL_ACTIONS.orange, CRITICAL_ACTIONS.green]) {
      expect(contrastRatio('#FFFFFF', bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('theme override helpers', () => {
  it('parseert alleen bekende query-ids', () => {
    expect(parseThemeQueryParam('galaxy')).toBe('galaxy');
    expect(parseThemeQueryParam('nope')).toBeNull();
    expect(parseThemeQueryParam(undefined)).toBeNull();
  });
});

describe('theme store migration shape', () => {
  it('normalizeert legacy pref + ontbrekende skin', () => {
    const persisted = { pref: 'dark' } as { pref?: string; skin?: string };
    const skin = normalizeThemeSkinId(persisted.skin);
    const pref = persisted.pref === 'dark' || persisted.pref === 'light' || persisted.pref === 'system' ? persisted.pref : 'system';
    expect(pref).toBe('dark');
    expect(skin).toBe('classic');
  });
});
