import { Alert, Linking, Platform } from 'react-native';

/** Nederlands alarmnummer — alleen via expliciete user-tap, nooit auto. */
export const EMERGENCY_NUMBER = '112' as const;
export const TEL_112 = `tel:${EMERGENCY_NUMBER}` as const;

export const COPY = {
  title: 'Open 112 in de telefoon-app',
  hint: 'Je bevestigt zelf; SafeWalk belt niet automatisch',
  webUnsupported:
    'Op dit apparaat kan SafeWalk de telefoon-app niet openen. Bel zelf 112 op een telefoon. SafeWalk belt nooit automatisch.',
  failed:
    'Kon de telefoon-app niet openen. Bel zelf 112. SafeWalk belt nooit automatisch.',
} as const;

export type Dial112Method =
  | 'android_action_dial'
  | 'ios_tel'
  | 'web_tel'
  | 'tel_fallback';

export type Dial112Result =
  | { ok: true; method: Dial112Method }
  | { ok: false; reason: 'unsupported' | 'failed'; message: string };

export type Dial112Deps = {
  platform: 'ios' | 'android' | 'web' | string;
  openURL: (url: string) => Promise<unknown>;
  canOpenURL?: (url: string) => Promise<boolean>;
  /** Android-only: moet Intent.ACTION_DIAL gebruiken (nooit ACTION_CALL). */
  androidActionDial?: (telUri: string) => Promise<void>;
  alert?: (title: string, message: string) => void;
};

function defaultAndroidActionDial(): Dial112Deps['androidActionDial'] {
  if (Platform.OS !== 'android') return undefined;
  try {
    // Bestaande lokale native module (ACTION_DIAL). Afwezig in Expo Go / web / uncompiled.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('safewalk-native') as {
      openEmergencyDialer?: () => Promise<boolean>;
    };
    const dial = native.openEmergencyDialer;
    if (typeof dial !== 'function') return undefined;
    return async () => {
      const ok = await dial();
      if (!ok) throw new Error('native dialer false');
    };
  } catch {
    return undefined;
  }
}

/**
 * Opent de telefoon-UI met 112 vooringevuld. Gebruiker moet zelf op bellen drukken.
 * Android: ACTION_DIAL (geen CALL_PHONE / geen ACTION_CALL).
 * iOS: publieke tel:112 (OS toont bevestiging; exacte toetsenbord-UI niet gegarandeerd).
 * Web: geen nep-succes; leg uit dat de telefoon-app nodig is.
 * Nooit aanroepen vanuit SOS/gevaar-start — alleen vanuit expliciete 112-knop.
 */
export async function open112Dialer(deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  const platform = deps?.platform ?? Platform.OS;
  const openURL = deps?.openURL ?? ((url: string) => Linking.openURL(url));
  const canOpenURL = deps?.canOpenURL ?? ((url: string) => Linking.canOpenURL(url));
  const androidActionDial = deps?.androidActionDial ?? defaultAndroidActionDial();

  try {
    if (platform === 'android') {
      if (androidActionDial) {
        await androidActionDial(TEL_112);
        return { ok: true, method: 'android_action_dial' };
      }
      // Fallback zonder native build: tel: via ACTION_VIEW opent doorgaans de kiezer, niet CALL.
      // Geen ACTION_CALL / geen CALL_PHONE-permission.
      await openURL(TEL_112);
      return { ok: true, method: 'tel_fallback' };
    }

    if (platform === 'ios') {
      await openURL(TEL_112);
      return { ok: true, method: 'ios_tel' };
    }

    // Web / overig: probeer tel:; bij falen of onbeschikbaar → duidelijke NL-uitleg + nummer.
    let can = false;
    try {
      can = await canOpenURL(TEL_112);
    } catch {
      can = false;
    }
    if (!can) {
      return { ok: false, reason: 'unsupported', message: COPY.webUnsupported };
    }
    try {
      await openURL(TEL_112);
      return { ok: true, method: 'web_tel' };
    } catch {
      return { ok: false, reason: 'unsupported', message: COPY.webUnsupported };
    }
  } catch {
    return { ok: false, reason: 'failed', message: COPY.failed };
  }
}

/** Knop-handler: toont Alert bij falen; opent nooit stil “succes” zonder dialer. */
export async function onPressOpen112(deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  const result = await open112Dialer(deps);
  if (!result.ok) {
    const alert = deps?.alert ?? ((title: string, message: string) => Alert.alert(title, message));
    alert('112', result.message);
  }
  return result;
}
