import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

/**
 * Centrale entry-points voor shortcuts / tile / volume×2 / deep links.
 * Native tile & quick actions vereisen een development build (bron geconfigureerd, runtime uncompiled in Expo Go/web).
 */
export const ENTRY = {
  quickPing: '/quick-ping',
  dashboard: '/dashboard',
  deepQuickPing: 'safewalk://quick-ping',
} as const;

export function openQuickPing() {
  try {
    router.push(ENTRY.quickPing);
  } catch {
    Linking.openURL(ENTRY.deepQuickPing).catch(() => undefined);
  }
}

export async function initQuickActions(): Promise<{ ok: boolean; detail: string }> {
  if (Platform.OS === 'web') return { ok: false, detail: 'Quick actions niet op web' };
  try {
    const QA = await import('expo-quick-actions');
    // Dynamic actions (aanvulling op static iosActions uit config plugin)
    await QA.setItems([
      {
        id: 'quick_ping',
        title: 'Stuur mijn locatie',
        subtitle: 'Jij bevestigt in de app',
        icon: Platform.OS === 'ios' ? 'symbol:location.fill' : undefined,
        params: { href: ENTRY.quickPing },
      },
    ]);
    QA.addListener((action) => {
      const href = (action?.params as { href?: string } | undefined)?.href;
      if (href) router.push(href as never);
      else if (action?.id === 'quick_ping') openQuickPing();
    });
    return { ok: true, detail: 'Quick actions geregistreerd (effectief na native build)' };
  } catch (e) {
    return { ok: false, detail: 'Quick actions module ontbreekt of uncompiled: ' + String(e).slice(0, 120) };
  }
}

export async function initVolumeDoublePress(onFire: () => void): Promise<{ ok: boolean; detail: string }> {
  if (Platform.OS !== 'android') {
    return { ok: false, detail: 'Volume×2 foreground alleen Android; iOS → shortcut/tile/deep link' };
  }
  try {
    const native = await import('safewalk-native');
    if (!native.isVolumeDoublePressSupported()) {
      return { ok: false, detail: native.getNativeCapabilities().notes };
    }
    native.setVolumeDoublePressEnabled(true);
    native.addVolumeDoublePressListener(onFire);
    return { ok: true, detail: 'Volume×2 listener aan (foreground Activity; vereist compiled native module)' };
  } catch (e) {
    return { ok: false, detail: 'safewalk-native uncompiled/unavailable: ' + String(e).slice(0, 120) };
  }
}

export async function maybePromptQsTile(): Promise<string> {
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const tile = await import('react-native-quick-settings-tile');
    if (!tile.isAvailable()) return 'unavailable';
    const r = await tile.requestAddTile();
    return String(r);
  } catch {
    return 'uncompiled';
  }
}

export function getNativeCapabilitiesSafe(): string {
  try {
    // Metro resolves browser/web stub on web
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('safewalk-native') as typeof import('safewalk-native');
    const c = native.getNativeCapabilities();
    return `Native: volume×2=${String(c.volumeDoublePress)} backgroundTorch=${String(c.backgroundTorch)} compiled=${String((c as { compiled?: boolean }).compiled ?? false)}. ${c.notes}`;
  } catch {
    return 'Native module niet geladen (web/Expo Go). Bron wel aanwezig onder modules/safewalk-native — vereist dev client compile.';
  }
}
