/**
 * SafeWalk theme skins. Critical safety action colors are invariant across skins.
 * Immersive skins (Galaxy + seasonal) always resolve dark surfaces — classic keeps light/dark.
 */

export const CRITICAL_ACTIONS = {
  red: '#EF4444',
  orange: '#EA580C',
  green: '#15803D',
  amber: '#F59E0B',
} as const;

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
  /** Input / nested surface — slightly elevated vs card */
  field: string;
  text: string;
  muted: string;
  placeholder: string;
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
  /** Immersive skins ignore system light preference (always night surfaces). */
  immersive: boolean;
  swatches: [string, string, string];
  dark: SurfaceTokens;
  light: SurfaceTokens;
};

export const THEME_SKINS: Record<ThemeSkinId, ThemeSkinDef> = {
  classic: {
    id: 'classic',
    label: 'Klassiek',
    description: 'Nachtblauw met SafeWalk-paars — volgt licht/donker.',
    decoration: 'none',
    immersive: false,
    swatches: ['#080F23', '#7856FF', '#F5F6FB'],
    dark: {
      bg: '#080F23', card: '#121A33', field: '#1A2444', text: '#FFFFFF', muted: '#A5ADC8',
      placeholder: '#848DA6', border: '#26304F', purple: CLASSIC_PURPLE, accent: '#2DD4BF',
      blobA: 'rgba(120,86,255,0.14)', blobB: 'rgba(45,212,191,0.10)',
    },
    light: {
      bg: '#F5F6FB', card: '#FFFFFF', field: '#F0F2F8', text: '#080F23', muted: '#4A5272',
      placeholder: '#656D8B', border: '#DADFEA', purple: CLASSIC_PURPLE, accent: '#0F766E',
      blobA: 'rgba(120,86,255,0.10)', blobB: 'rgba(45,212,191,0.12)',
    },
  },
  galaxy: {
    id: 'galaxy',
    label: 'Galaxy',
    description: 'SnapShot X: diepe nacht, paarse nevel, sterrenveld.',
    decoration: 'galaxy',
    immersive: true,
    swatches: ['#08090E', '#8446BC', '#2B6FA9'],
    dark: {
      bg: '#08090E', card: '#1A1425', field: '#241C33', text: '#FAFAFF', muted: '#A6A9B7',
      placeholder: '#848795', border: '#3D3A4A', purple: '#AE16C7', accent: '#4298FF',
      blobA: 'rgba(132,70,188,0.22)', blobB: 'rgba(43,111,169,0.14)',
    },
    light: {
      // unused when immersive — kept as dark twin for safety
      bg: '#08090E', card: '#1A1425', field: '#241C33', text: '#FAFAFF', muted: '#A6A9B7',
      placeholder: '#848795', border: '#3D3A4A', purple: '#AE16C7', accent: '#4298FF',
      blobA: 'rgba(132,70,188,0.18)', blobB: 'rgba(43,111,169,0.12)',
    },
  },
  halloween: {
    id: 'halloween',
    label: 'Halloween',
    description: 'Diepe nacht, maan en pompoen — geen pastel.',
    decoration: 'halloween',
    immersive: true,
    swatches: ['#0C0709', '#EA580C', '#FBBF24'],
    dark: {
      bg: '#0C0709', card: '#1C1014', field: '#2A181E', text: '#FFF7ED', muted: '#D4B5A5',
      placeholder: '#9E7F6F', border: '#5C3228', purple: '#EA580C', accent: '#FBBF24',
      blobA: 'rgba(234,88,12,0.2)', blobB: 'rgba(251,191,36,0.12)',
    },
    light: {
      bg: '#0C0709', card: '#1C1014', field: '#2A181E', text: '#FFF7ED', muted: '#D4B5A5',
      placeholder: '#9E7F6F', border: '#5C3228', purple: '#EA580C', accent: '#FBBF24',
      blobA: 'rgba(234,88,12,0.16)', blobB: 'rgba(251,191,36,0.1)',
    },
  },
  kerst: {
    id: 'kerst',
    label: 'Kerst',
    description: 'Donker dennegroen met gloeiend goud en sneeuw.',
    decoration: 'kerst',
    immersive: true,
    swatches: ['#06140E', '#166534', '#EAB308'],
    dark: {
      bg: '#06140E', card: '#0E2418', field: '#163524', text: '#F0FDF4', muted: '#A8C9B6',
      placeholder: '#8FB09A', border: '#2A4F3A', purple: '#15803D', accent: '#EAB308',
      blobA: 'rgba(21,128,61,0.22)', blobB: 'rgba(234,179,8,0.14)',
    },
    light: {
      bg: '#06140E', card: '#0E2418', field: '#163524', text: '#F0FDF4', muted: '#A8C9B6',
      placeholder: '#8FB09A', border: '#2A4F3A', purple: '#15803D', accent: '#EAB308',
      blobA: 'rgba(21,128,61,0.18)', blobB: 'rgba(234,179,8,0.12)',
    },
  },
  sinterklaas: {
    id: 'sinterklaas',
    label: 'Sinterklaas',
    description: 'Diep bordeaux met goud — cadeaus en daklijn.',
    decoration: 'sinterklaas',
    immersive: true,
    swatches: ['#1A080E', '#9F1239', '#EAB308'],
    dark: {
      bg: '#1A080E', card: '#2C1018', field: '#3D1824', text: '#FFF1F2', muted: '#E0B4BE',
      placeholder: '#AD7F8A', border: '#6B2A3A', purple: '#BE123C', accent: '#EAB308',
      blobA: 'rgba(190,18,60,0.22)', blobB: 'rgba(234,179,8,0.14)',
    },
    light: {
      bg: '#1A080E', card: '#2C1018', field: '#3D1824', text: '#FFF1F2', muted: '#E0B4BE',
      placeholder: '#AD7F8A', border: '#6B2A3A', purple: '#BE123C', accent: '#EAB308',
      blobA: 'rgba(190,18,60,0.18)', blobB: 'rgba(234,179,8,0.12)',
    },
  },
  noorderlicht: {
    id: 'noorderlicht',
    label: 'Noorderlicht',
    description: 'Poolnacht met teal/groene aurora.',
    decoration: 'aurora',
    immersive: true,
    swatches: ['#030E12', '#14B8A6', '#4ADE80'],
    dark: {
      bg: '#030E12', card: '#0A1F26', field: '#123038', text: '#ECFEFF', muted: '#9DB9C0',
      placeholder: '#7E999D', border: '#1E4650', purple: '#0D9488', accent: '#4ADE80',
      blobA: 'rgba(20,184,166,0.22)', blobB: 'rgba(74,222,128,0.14)',
    },
    light: {
      bg: '#030E12', card: '#0A1F26', field: '#123038', text: '#ECFEFF', muted: '#9DB9C0',
      placeholder: '#7E999D', border: '#1E4650', purple: '#0D9488', accent: '#4ADE80',
      blobA: 'rgba(20,184,166,0.18)', blobB: 'rgba(74,222,128,0.12)',
    },
  },
  oceaan: {
    id: 'oceaan',
    label: 'Oceaan',
    description: 'Diepzeeblauw met golven.',
    decoration: 'ocean',
    immersive: true,
    swatches: ['#07131F', '#0284C7', '#38BDF8'],
    dark: {
      bg: '#07131F', card: '#0F2233', field: '#173246', text: '#F0F9FF', muted: '#9DB7CC',
      placeholder: '#819BAC', border: '#2A4A62', purple: '#0284C7', accent: '#38BDF8',
      blobA: 'rgba(2,132,199,0.22)', blobB: 'rgba(56,189,248,0.14)',
    },
    light: {
      bg: '#07131F', card: '#0F2233', field: '#173246', text: '#F0F9FF', muted: '#9DB7CC',
      placeholder: '#819BAC', border: '#2A4A62', purple: '#0284C7', accent: '#38BDF8',
      blobA: 'rgba(2,132,199,0.18)', blobB: 'rgba(56,189,248,0.12)',
    },
  },
  zonsondergang: {
    id: 'zonsondergang',
    label: 'Roze zonsondergang',
    description: 'Donkere avondlucht met warme gloed.',
    decoration: 'sunset',
    immersive: true,
    swatches: ['#1A0E18', '#DB2777', '#FB923C'],
    dark: {
      bg: '#1A0E18', card: '#2A1626', field: '#3A1E34', text: '#FFF1F5', muted: '#D6A8BC',
      placeholder: '#AC8496', border: '#5C3A50', purple: '#DB2777', accent: '#FB923C',
      blobA: 'rgba(219,39,119,0.22)', blobB: 'rgba(251,146,60,0.14)',
    },
    light: {
      bg: '#1A0E18', card: '#2A1626', field: '#3A1E34', text: '#FFF1F5', muted: '#D6A8BC',
      placeholder: '#AC8496', border: '#5C3A50', purple: '#DB2777', accent: '#FB923C',
      blobA: 'rgba(219,39,119,0.18)', blobB: 'rgba(251,146,60,0.12)',
    },
  },
};

export const DEFAULT_THEME_SKIN: ThemeSkinId = 'galaxy';

export function isThemeSkinId(v: unknown): v is ThemeSkinId {
  return typeof v === 'string' && (THEME_SKIN_IDS as readonly string[]).includes(v);
}

export function normalizeThemeSkinId(v: unknown): ThemeSkinId {
  return isThemeSkinId(v) ? v : DEFAULT_THEME_SKIN;
}

export function listThemeSkins(): ThemeSkinDef[] {
  return THEME_SKIN_IDS.map((id) => THEME_SKINS[id]);
}

/** Immersive skins always use dark surfaces. */
export function surfacesFor(skin: ThemeSkinId, preferDark: boolean): SurfaceTokens {
  const def = THEME_SKINS[normalizeThemeSkinId(skin)];
  const dark = def.immersive ? true : preferDark;
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
  immersive: boolean;
  isDark: boolean;
};

export function resolveTheme(skinId: ThemeSkinId | string, preferDark: boolean): ResolvedTheme {
  const id = normalizeThemeSkinId(skinId);
  const def = THEME_SKINS[id];
  const isDark = def.immersive ? true : preferDark;
  const s = surfacesFor(id, preferDark);
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
    immersive: def.immersive,
    isDark,
  };
}

