/**
 * SafeWalk theme skins. Critical safety action colors are invariant across skins.
 * Surfaces adapt to light/dark preference; decorations are static (no looping animation).
 */

export const CRITICAL_ACTIONS = {
  red: '#EF4444',
  orange: '#EA580C',
  green: '#15803D',
  amber: '#F59E0B',
} as const;

/** Brand accent used for primary buttons — may tint per skin but stays on-brand. */
export const CLASSIC_PURPLE = '#7856FF';

export const THEME_SKIN_IDS = [
  'classic',
  'galaxy',
  'halloween',
  'kerst',
  'sinterklaas',
  'noorderlicht',
  'oceaan',
  'zonsondergang',
] as const;

export type ThemeSkinId = (typeof THEME_SKIN_IDS)[number];
export type DecorationKind =
  | 'none'
  | 'galaxy'
  | 'halloween'
  | 'kerst'
  | 'sinterklaas'
  | 'aurora'
  | 'ocean'
  | 'sunset';

export type SurfaceTokens = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  purple: string;
  accent: string;
  blobA: string;
  blobB: string;
};

export type ThemeSkinDef = {
  id: ThemeSkinId;
  label: string;
  description: string;
  decoration: DecorationKind;
  /** Three preview swatches for the settings picker. */
  swatches: [string, string, string];
  dark: SurfaceTokens;
  light: SurfaceTokens;
};

export const THEME_SKINS: Record<ThemeSkinId, ThemeSkinDef> = {
  classic: {
    id: 'classic',
    label: 'Klassiek',
    description: 'Nachtblauw met SafeWalk-paars — de standaardlook.',
    decoration: 'none',
    swatches: ['#080F23', '#7856FF', '#F5F6FB'],
    dark: {
      bg: '#080F23', card: '#121A33', text: '#FFFFFF', muted: '#A5ADC8', border: '#26304F',
      purple: CLASSIC_PURPLE, accent: '#2DD4BF',
      blobA: 'rgba(120,86,255,0.14)', blobB: 'rgba(45,212,191,0.10)',
    },
    light: {
      bg: '#F5F6FB', card: '#FFFFFF', text: '#080F23', muted: '#4A5272', border: '#DADFEA',
      purple: CLASSIC_PURPLE, accent: '#0F766E',
      blobA: 'rgba(120,86,255,0.10)', blobB: 'rgba(45,212,191,0.12)',
    },
  },
  galaxy: {
    id: 'galaxy',
    label: 'Galaxy',
    description: 'SnapShot X-stijl: diepe nacht, paarse nevel en sterrenveld (statisch).',
    decoration: 'galaxy',
    swatches: ['#08090E', '#8446BC', '#2B6FA9'],
    dark: {
      bg: '#08090E', card: '#1A1425', text: '#FAFAFF', muted: '#A6A9B7', border: '#30333D',
      purple: '#AE16C7', accent: '#4298FF',
      blobA: 'rgba(132,70,188,0.22)', blobB: 'rgba(43,111,169,0.14)',
    },
    // Galaxy is immersive-dark; light mode still readable but keeps night character.
    light: {
      bg: '#12101C', card: '#1F1830', text: '#FAFAFF', muted: '#B7B3C9', border: '#3A3450',
      purple: '#B713D5', accent: '#4298FF',
      blobA: 'rgba(132,70,188,0.18)', blobB: 'rgba(43,111,169,0.12)',
    },
  },
  halloween: {
    id: 'halloween',
    label: 'Halloween',
    description: 'Warm middernacht met maan en een subtiele pompoenaccent.',
    decoration: 'halloween',
    swatches: ['#1A0F14', '#F97316', '#FBBF24'],
    dark: {
      bg: '#1A0F14', card: '#2A1820', text: '#FFF7ED', muted: '#D6B9A8', border: '#4A2E38',
      purple: '#C2410C', accent: '#FBBF24',
      blobA: 'rgba(249,115,22,0.16)', blobB: 'rgba(251,191,36,0.10)',
    },
    light: {
      bg: '#FFF7ED', card: '#FFFFFF', text: '#431407', muted: '#9A3412', border: '#FED7AA',
      purple: '#C2410C', accent: '#B45309',
      blobA: 'rgba(249,115,22,0.10)', blobB: 'rgba(251,191,36,0.12)',
    },
  },
  kerst: {
    id: 'kerst',
    label: 'Kerst',
    description: 'Winterbos met dennegroen, goud en zachte sneeuwvlokken.',
    decoration: 'kerst',
    swatches: ['#0F1F17', '#166534', '#EAB308'],
    dark: {
      bg: '#0F1F17', card: '#173024', text: '#F0FDF4', muted: '#A7C4B5', border: '#2F4F3E',
      purple: '#15803D', accent: '#EAB308',
      blobA: 'rgba(22,101,52,0.22)', blobB: 'rgba(234,179,8,0.12)',
    },
    light: {
      bg: '#F0FDF4', card: '#FFFFFF', text: '#14532D', muted: '#3F6B52', border: '#BBF7D0',
      purple: '#15803D', accent: '#A16207',
      blobA: 'rgba(22,101,52,0.10)', blobB: 'rgba(234,179,8,0.12)',
    },
  },
  sinterklaas: {
    id: 'sinterklaas',
    label: 'Sinterklaas',
    description: 'Warm bordeaux en goud — cadeau & mijter-accenten, zonder stereotypen.',
    decoration: 'sinterklaas',
    swatches: ['#2A0F18', '#9F1239', '#EAB308'],
    dark: {
      bg: '#2A0F18', card: '#3B1824', text: '#FFF1F2', muted: '#D4A5B0', border: '#5C2A38',
      purple: '#BE123C', accent: '#EAB308',
      blobA: 'rgba(190,18,60,0.18)', blobB: 'rgba(234,179,8,0.12)',
    },
    light: {
      bg: '#FFF1F2', card: '#FFFFFF', text: '#4C0519', muted: '#9F1239', border: '#FECDD3',
      purple: '#BE123C', accent: '#A16207',
      blobA: 'rgba(190,18,60,0.10)', blobB: 'rgba(234,179,8,0.12)',
    },
  },
  noorderlicht: {
    id: 'noorderlicht',
    label: 'Noorderlicht',
    description: 'Poolnacht met teal- en groene aurora-bogen.',
    decoration: 'aurora',
    swatches: ['#04151A', '#14B8A6', '#4ADE80'],
    dark: {
      bg: '#04151A', card: '#0C242B', text: '#ECFEFF', muted: '#9DB9C0', border: '#1E3F48',
      purple: '#0D9488', accent: '#4ADE80',
      blobA: 'rgba(20,184,166,0.20)', blobB: 'rgba(74,222,128,0.12)',
    },
    light: {
      bg: '#ECFEFF', card: '#FFFFFF', text: '#134E4A', muted: '#0F766E', border: '#A5F3FC',
      purple: '#0F766E', accent: '#15803D',
      blobA: 'rgba(20,184,166,0.12)', blobB: 'rgba(74,222,128,0.10)',
    },
  },
  oceaan: {
    id: 'oceaan',
    label: 'Oceaan',
    description: 'Diepblauw met zachte golfvormen — fris en rustig.',
    decoration: 'ocean',
    swatches: ['#0B1C2C', '#0284C7', '#38BDF8'],
    dark: {
      bg: '#0B1C2C', card: '#132A40', text: '#F0F9FF', muted: '#9DB7CC', border: '#274560',
      purple: '#0284C7', accent: '#38BDF8',
      blobA: 'rgba(2,132,199,0.20)', blobB: 'rgba(56,189,248,0.12)',
    },
    light: {
      bg: '#F0F9FF', card: '#FFFFFF', text: '#0C4A6E', muted: '#0369A1', border: '#BAE6FD',
      purple: '#0369A1', accent: '#0284C7',
      blobA: 'rgba(2,132,199,0.10)', blobB: 'rgba(56,189,248,0.12)',
    },
  },
  zonsondergang: {
    id: 'zonsondergang',
    label: 'Roze zonsondergang',
    description: 'Zachte avondlucht met roze en perzik — warm maar leesbaar.',
    decoration: 'sunset',
    swatches: ['#2A1524', '#DB2777', '#FB923C'],
    dark: {
      bg: '#2A1524', card: '#3B2033', text: '#FFF1F5', muted: '#D6A8BC', border: '#5C3A50',
      purple: '#DB2777', accent: '#FB923C',
      blobA: 'rgba(219,39,119,0.18)', blobB: 'rgba(251,146,60,0.12)',
    },
    light: {
      bg: '#FFF1F5', card: '#FFFFFF', text: '#831843', muted: '#9D174D', border: '#FECDD3',
      purple: '#DB2777', accent: '#C2410C',
      blobA: 'rgba(219,39,119,0.10)', blobB: 'rgba(251,146,60,0.12)',
    },
  },
};

export const DEFAULT_THEME_SKIN: ThemeSkinId = 'galaxy';

export function isThemeSkinId(v: unknown): v is ThemeSkinId {
  return typeof v === 'string' && (THEME_SKIN_IDS as readonly string[]).includes(v);
}

/** Unknown / legacy values fall back to classic (never throws). */
export function normalizeThemeSkinId(v: unknown): ThemeSkinId {
  return isThemeSkinId(v) ? v : DEFAULT_THEME_SKIN;
}

export function listThemeSkins(): ThemeSkinDef[] {
  return THEME_SKIN_IDS.map((id) => THEME_SKINS[id]);
}

export function surfacesFor(skin: ThemeSkinId, dark: boolean): SurfaceTokens {
  const def = THEME_SKINS[normalizeThemeSkinId(skin)];
  return dark ? def.dark : def.light;
}


export type ResolvedTheme = SurfaceTokens & {
  red: string;
  orange: string;
  green: string;
  amber: string;
  white: string;
  night: string;
  skinId: ThemeSkinId;
  skinLabel: string;
  decoration: DecorationKind;
  isDark: boolean;
  purple: string;
  accent: string;
  blobA: string;
  blobB: string;
};

/** Pure theme resolve (no React / AsyncStorage). */
export function resolveTheme(skinId: ThemeSkinId | string, isDark: boolean): ResolvedTheme {
  const id = normalizeThemeSkinId(skinId);
  const def = THEME_SKINS[id];
  const s = surfacesFor(id, isDark);
  return {
    ...s,
    red: CRITICAL_ACTIONS.red,
    orange: CRITICAL_ACTIONS.orange,
    green: CRITICAL_ACTIONS.green,
    amber: CRITICAL_ACTIONS.amber,
    white: '#FFFFFF',
    night: '#080F23',
    skinId: id,
    skinLabel: def.label,
    decoration: def.decoration,
    isDark,
  };
}
