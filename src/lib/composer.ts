/**
 * Pure builders for user-confirmed SMS / WhatsApp composers. Nothing here sends anything:
 * the OS composer opens pre-filled and the user must tap Send. No loops, no background sends.
 */
import { mapsQueryUrl, validCoords } from './coords';
import { rideShareLine, type RideShare } from './rideShare';

export const MAX_SMS_RECIPIENTS = 10;

export function e164Digits(phoneE164: string): string {
  const d = phoneE164.replace(/[^\d+]/g, '');
  if (!/^\+\d{8,15}$/.test(d)) throw new Error('BAD_PHONE');
  return d;
}

export function locationMessage(url: string): string {
  if (!/^https:\/\/[^\s]+\/track\/live\?token=[0-9a-f]{64}$/.test(url)) throw new Error('BAD_LINK');
  return `Ik deel mijn live locatie via SafeWalk (tijdelijk, intrekbaar): ${url}\nSafeWalk belt niet 112.`;
}

/** Meekijklink voor een reis: wie de link heeft ziet de reis tot aankomst, zonder app. */
export function tripLinkMessage(url: string): string {
  if (!/^https:\/\/[^\s]+\/track\/live\?token=[0-9a-f]{64}$/.test(url)) throw new Error('BAD_LINK');
  return `Ik ben onderweg. Via deze link kun je tot ik er ben zien waar ik ben en of ik veilig ben aangekomen (geen app nodig, tijdelijk): ${url}\nSafeWalk belt niet 112.`;
}

/** Sms-reserve: locatie + Google Maps-link. De app opent alleen de composer; de gebruiker tikt op versturen. */
export function reserveSmsMessage(o: {
  lat?: number;
  lng?: number;
  context?: 'sos' | 'trip' | 'share';
  what?: string;
  ride?: RideShare | null;
  link?: string;
}): string {
  const loc = validCoords(o.lat, o.lng) ? mapsQueryUrl(o.lat!, o.lng!) : null;
  const where = loc ? `Laatst bekende locatie: ${loc}` : 'Er is geen recente locatie bekend.';
  const head = (o.context === 'trip' || o.context === 'share')
    ? `Ik deel mijn locatie via SafeWalk${o.what ? ` (${o.what})` : ''}.`
    : 'SOS via SafeWalk.';
  const ride = rideShareLine(o.ride ?? undefined);
  const link = o.link && /^https:\/\/\S+$/.test(o.link) ? o.link : '';
  return [head, where, link, ride, 'SafeWalk belt niet 112. Ik stuur dit bericht zelf.']
    .filter((x) => x && x.trim())
    .join(' ');
}

/** Sms-composer zonder vooraf ingevuld nummer: de gebruiker kiest zelf de ontvanger. */
export function smsBodyUrl(os: string, body: string): string {
  const b = encodeURIComponent(body);
  return os === 'ios' ? `sms:&body=${b}` : `sms:?body=${b}`;
}

/** One composer for all chosen recipients (user still presses Send once). */
export function smsUrl(os: string, phones: string[], body: string): string {
  if (phones.length === 0) throw new Error('NO_RECIPIENTS');
  if (phones.length > MAX_SMS_RECIPIENTS) throw new Error('TOO_MANY_RECIPIENTS');
  const nums = phones.map(e164Digits);
  const b = encodeURIComponent(body);
  if (os === 'ios') {
    return nums.length === 1 ? `sms:${nums[0]}&body=${b}` : `sms:/open?addresses=${nums.join(',')}&body=${b}`;
  }
  return `sms:${nums.join(',')}?body=${b}`;
}

/** WhatsApp has no multi-recipient deep link: one chat per tap, chosen by the user. */
export function whatsappUrl(phone: string, body: string): string {
  return `https://wa.me/${e164Digits(phone).slice(1)}?text=${encodeURIComponent(body)}`;
}
