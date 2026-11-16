/**
 * Automatische sms-locatie (alleen Android, opt-in, nooit in tests naar een echt nummer).
 * De verzender is injecteerbaar: productie gebruikt de native module, tests een mock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import type { ConnectionKind } from './connectionStatus';
import { validCoords } from './coords';
import { e164Digits } from './composer';
import { AUTO_SMS_COPY } from '../content/longShare';

export const AUTO_SMS_INTERVAL_MS = 10 * 60_000;
export const AUTO_SMS_MAX_ROUNDS = 8;
export const AUTO_SMS_MAX_RECIPIENTS = 5;
export const AUTO_SMS_MAX_BODY = 160;
const OPT_KEY = 'safewalk.autoSms.optIn.v1';
const PHONES_KEY = 'safewalk.autoSms.phones.v1';
const STATE_KEY = 'safewalk.autoSms.state.v1';

export type AutoSmsSkip =
  | 'opt_out' | 'not_android' | 'underage' | 'no_permission' | 'online'
  | 'inactive' | 'no_location' | 'no_recipients' | 'interval' | 'cap' | 'test_guard' | 'bad_body';

export type AutoSmsDecision =
  | { action: 'skip'; reason: AutoSmsSkip }
  | { action: 'send'; phones: string[]; body: string };

export type AutoSmsRoundState = { key: string; rounds: number; lastAt: number };

/** Korte GSM-vriendelijke sms (geen diakriet), coördinaten + kaartlink, max. 160 tekens. */
export function autoSmsBody(lat: number, lng: number): string {
  const ll = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const full = `SafeWalk locatie: ${ll} https://maps.google.com/?q=${ll} Geen internet. Bel zelf 112 bij gevaar.`;
  if (full.length <= AUTO_SMS_MAX_BODY) return full;
  const short = `SafeWalk: ${ll} https://maps.google.com/?q=${ll}`;
  return short.slice(0, AUTO_SMS_MAX_BODY);
}

export function normalizeSmsPhones(phones: string[], max = AUTO_SMS_MAX_RECIPIENTS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of phones) {
    try {
      const p = e164Digits(raw);
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= max) break;
    } catch { /* ongeldig nummer overslaan */ }
  }
  return out;
}

export function decideAutoSms(o: {
  platform: string;
  optIn: boolean;
  ageOk: boolean;
  permission: boolean;
  connection: ConnectionKind;
  active: boolean;
  lastRoundAt?: number;
  roundsSent: number;
  phones: string[];
  lat?: number;
  lng?: number;
  now: number;
}): AutoSmsDecision {
  if (o.platform !== 'android') return { action: 'skip', reason: 'not_android' };
  if (!o.optIn) return { action: 'skip', reason: 'opt_out' };
  if (!o.ageOk) return { action: 'skip', reason: 'underage' };
  if (!o.permission) return { action: 'skip', reason: 'no_permission' };
  if (!o.active) return { action: 'skip', reason: 'inactive' };
  if (o.connection === 'online') return { action: 'skip', reason: 'online' };
  if (!validCoords(o.lat, o.lng)) return { action: 'skip', reason: 'no_location' };
  const phones = normalizeSmsPhones(o.phones);
  if (phones.length === 0) return { action: 'skip', reason: 'no_recipients' };
  if (o.roundsSent >= AUTO_SMS_MAX_ROUNDS) return { action: 'skip', reason: 'cap' };
  if (o.lastRoundAt !== undefined && o.now - o.lastRoundAt < AUTO_SMS_INTERVAL_MS) return { action: 'skip', reason: 'interval' };
  const body = autoSmsBody(o.lat!, o.lng!);
  if (!body || body.length > AUTO_SMS_MAX_BODY) return { action: 'skip', reason: 'bad_body' };
  return { action: 'send', phones, body };
}

export type SmsSendResult = { ok: boolean; reason?: string };
export type SmsSender = (phone: string, body: string) => Promise<SmsSendResult>;

/** Hard guard: de echte verzender weigert in Jest/tests altijd. */
export function testGuardActive(): boolean {
  return typeof process !== 'undefined' && !!(process.env.JEST_WORKER_ID || process.env.VITEST || process.env.SAFEWALK_TEST_SMS === '1');
}

let injectedSender: SmsSender | null = null;

/** Alleen voor tests: zet een mock. Nooit een echte SmsManager. */
export function setAutoSmsSenderForTests(sender: SmsSender | null) {
  injectedSender = sender;
}

export async function getAutoSmsOptIn(): Promise<boolean> {
  return (await AsyncStorage.getItem(OPT_KEY)) === '1';
}
export async function setAutoSmsOptIn(v: boolean): Promise<void> {
  await AsyncStorage.setItem(OPT_KEY, v ? '1' : '0');
}
export async function getAutoSmsPhones(): Promise<string[]> {
  try { return normalizeSmsPhones(JSON.parse((await AsyncStorage.getItem(PHONES_KEY)) ?? '[]')); }
  catch { return []; }
}
export async function setAutoSmsPhones(phones: string[]): Promise<void> {
  await AsyncStorage.setItem(PHONES_KEY, JSON.stringify(normalizeSmsPhones(phones)));
}

export async function loadRoundState(key: string): Promise<AutoSmsRoundState> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? '{}') as AutoSmsRoundState;
    if (raw && raw.key === key) return raw;
  } catch { /* nieuw */ }
  return { key, rounds: 0, lastAt: 0 };
}
export async function saveRoundState(s: AutoSmsRoundState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));
}
export async function clearRoundState(): Promise<void> {
  await AsyncStorage.removeItem(STATE_KEY);
}

export async function requestSendSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
      title: AUTO_SMS_COPY.permission,
      message: AUTO_SMS_COPY.permissionAsk,
      buttonPositive: 'Toestaan',
      buttonNegative: 'Niet nu',
    });
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasSendSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
  } catch {
    return false;
  }
}

/**
 * Verstuur één ronde (alle gekozen nummers). Telt alleen geslaagde ronden
 * (minstens één sms aangekomen bij de SmsManager). In tests: alleen de injectie.
 */
export async function sendAutoSmsRound(
  phones: string[],
  body: string,
  sender?: SmsSender,
): Promise<{ sent: string[]; failed: string[] }> {
  const send = sender ?? injectedSender;
  if (!send) return { sent: [], failed: phones };
  if (testGuardActive() && sender === undefined && injectedSender === null) {
    return { sent: [], failed: phones };
  }
  const sent: string[] = [];
  const failed: string[] = [];
  for (const phone of normalizeSmsPhones(phones)) {
    try {
      const r = await send(phone, body);
      if (r.ok) sent.push(phone);
      else failed.push(phone);
    } catch {
      failed.push(phone);
    }
  }
  return { sent, failed };
}

export function autoSmsAgeOk(ageStatus: string | undefined, linkedChild: boolean): boolean {
  if (ageStatus === 'adult') return true;
  if (ageStatus === 'minor' && linkedChild) return true;
  return false;
}
