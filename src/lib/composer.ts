/**
 * Pure builders for user-confirmed SMS / WhatsApp composers. Nothing here sends anything:
 * the OS composer opens pre-filled and the user must tap Send. No loops, no background sends.
 */
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

/** Opens the mail composer. The user still presses Send. SafeWalk does not send mail. */
export function mailtoUrl(email: string, body: string): string {
  const to = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('BAD_EMAIL');
  return `mailto:${to}?body=${encodeURIComponent(body)}`;
}
