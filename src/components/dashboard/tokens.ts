/** Dashboard-only design tokens (does not change shared theme). */
export const dash = {
  navy: '#07111F',
  navyCard: '#0F1C31',
  navyElevated: '#16263F',
  teal: '#2DD4BF',
  tealDim: 'rgba(45, 212, 191, 0.16)',
  tealBorder: 'rgba(45, 212, 191, 0.35)',
  red: '#EF4444',
  redDeep: '#B91C1C',
  orange: '#F97316',
  orangeDeep: '#C2410C',
  green: '#22C55E',
  greenDeep: '#15803D',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: 'rgba(148, 163, 184, 0.22)',
  maxWidth: 420,
  radiusLg: 22,
  radiusMd: 16,
  touch: 48,
} as const;

export const dashLight = {
  bg: '#EEF3F8',
  card: '#FFFFFF',
  elevated: '#F7FAFC',
  text: '#0B1220',
  muted: '#5B6B7C',
  border: 'rgba(15, 28, 49, 0.10)',
  teal: '#0F766E',
  tealDim: 'rgba(15, 118, 110, 0.10)',
  tealBorder: 'rgba(15, 118, 110, 0.28)',
  blobA: 'rgba(45, 212, 191, 0.18)',
  blobB: 'rgba(120, 86, 255, 0.10)',
} as const;

export const dashDark = {
  bg: dash.navy,
  card: dash.navyCard,
  elevated: dash.navyElevated,
  text: dash.text,
  muted: dash.textMuted,
  border: dash.border,
  teal: dash.teal,
  tealDim: dash.tealDim,
  tealBorder: dash.tealBorder,
  blobA: 'rgba(45, 212, 191, 0.14)',
  blobB: 'rgba(120, 86, 255, 0.12)',
} as const;

export type DashTheme = typeof dashDark;
