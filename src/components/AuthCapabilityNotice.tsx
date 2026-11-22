import React from 'react';
import { Notice } from './ui';
import { i18n } from '../i18n';

export type AuthProvidersStatus = {
  google?: boolean;
  email?: boolean;
  /** True when Resend (or real mail) can deliver codes. */
  emailDelivery?: boolean;
  /** True when AUTH_EMAIL_DEV_LOG is on — local/test only, no inbox delivery. */
  emailDevLog?: boolean;
} | undefined | null;

export type AuthCapabilityMessage = { key: string; kind: 'info' | 'warn'; text: string };

/**
 * Pure copy from server-supplied flags only. Never invents status, never names
 * env vars / Resend / server logs for end users.
 */
export function authCapabilityMessages(providers: AuthProvidersStatus): AuthCapabilityMessage[] {
  if (!providers) return [];
  const out: AuthCapabilityMessage[] = [];
  if (!providers.google) {
    out.push({ key: 'g', kind: 'info', text: i18n.t('flow.auth.googleOff') });
  }
  if (providers.emailDelivery) {
    // real delivery — no email banner
  } else if (providers.emailDevLog) {
    out.push({
      key: 'e',
      kind: 'warn',
      text: i18n.t('flow.auth.emailTest'),
    });
  } else {
    out.push({
      key: 'e',
      kind: 'warn',
      text: i18n.t('flow.auth.emailOff'),
    });
  }
  return out;
}

/** Server-supplied capability copy only. */
export function AuthCapabilityNotice({ providers }: { providers: AuthProvidersStatus }) {
  const notices = authCapabilityMessages(providers);
  if (!notices.length) return null;
  return (
    <>
      {notices.map((n) => (
        <Notice key={n.key} kind={n.kind}>{n.text}</Notice>
      ))}
    </>
  );
}

export function mapAuthEmailError(code: string): string | null {
  if (code === 'EMAIL_NOT_CONFIGURED' || code === 'EMAIL_SEND_FAILED') {
    return i18n.t('flow.auth.emailLater');
  }
  return null;
}
