import { Alert, Linking, Platform } from 'react-native';
import { i18n } from '../i18n';

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
      return { ok: false, reason: 'unsupported', message: dialMessage('webUnsupported', '112') };
    }
    try {
      await openURL(TEL_112);
      return { ok: true, method: 'web_tel' };
    } catch {
      return { ok: false, reason: 'unsupported', message: dialMessage('webUnsupported', '112') };
    }
  } catch {
    return { ok: false, reason: 'failed', message: dialMessage('failed', '112') };
  }
}


/**
 * Opent de telefoon-UI met een nummer vooringevuld. Alleen na een tik van de gebruiker.
 * Voor 112 op Android blijft de native ACTION_DIAL-module de voorkeur (zie open112Dialer).
 */
function dialMessage(kind: 'failed' | 'webUnsupported' | 'invalid', number: string): string {
  const lang = i18n.resolvedLanguage || i18n.language;
  if (!lang || lang === 'nl') {
    if (kind === 'invalid') return 'Ongeldig telefoonnummer.';
    return COPY[kind].replaceAll('112', number);
  }
  return i18n.t(`dial.${kind}`, { number });
}

/** Opens the phone UI with a regional emergency number. 112 keeps the Android ACTION_DIAL path. */
export async function openEmergencyNumber(digits: string, deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  if (!/^\d{2,15}$/.test(digits)) {
    return { ok: false, reason: 'failed', message: dialMessage('invalid', digits) };
  }
  if (digits === '112') return open112Dialer(deps);
  return openTelDialer(`tel:${digits}`, deps);
}

export async function openTelDialer(telUri: string, deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  if (!/^tel:\+?\d{2,15}$/.test(telUri)) {
    return { ok: false, reason: 'failed', message: dialMessage('invalid', telUri.replace(/^tel:/, '')) };
  }
  if (telUri === TEL_112) return open112Dialer(deps);
  const number = telUri.replace(/^tel:/, '');
  const platform = deps?.platform ?? Platform.OS;
  const openURL = deps?.openURL ?? ((url: string) => Linking.openURL(url));
  const canOpenURL = deps?.canOpenURL ?? ((url: string) => Linking.canOpenURL(url));
  const failed = { ok: false as const, reason: 'failed' as const, message: dialMessage('failed', number) };
  const unsupported = { ok: false as const, reason: 'unsupported' as const, message: dialMessage('webUnsupported', number) };
  try {
    if (platform === 'android' || platform === 'ios') {
      await openURL(telUri);
      return { ok: true, method: platform === 'ios' ? 'ios_tel' : 'tel_fallback' };
    }
    let can = false;
    try { can = await canOpenURL(telUri); } catch { can = false; }
    if (!can) return unsupported;
    await openURL(telUri);
    return { ok: true, method: 'web_tel' };
  } catch {
    return failed;
  }
}

export async function onPressOpenTel(telUri: string, title: string, deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  const result = await openTelDialer(telUri, deps);
  if (!result.ok) {
    const alert = deps?.alert ?? ((t: string, message: string) => Alert.alert(t, message));
    alert(title, result.message);
  }
  return result;
}

export async function onPressOpenEmergency(digits: string, deps?: Partial<Dial112Deps>): Promise<Dial112Result> {
  const result = await openEmergencyNumber(digits, deps);
  if (!result.ok) {
    const alert = deps?.alert ?? ((title: string, message: string) => Alert.alert(title, message));
    alert(digits, result.message);
  }
  return result;
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
