import React from 'react';
import { Notice } from './ui';

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
    out.push({ key: 'g', kind: 'info', text: 'Inloggen met Google is hier niet beschikbaar.' });
  }
  if (providers.emailDelivery) {
    // real delivery — no email banner
  } else if (providers.emailDevLog) {
    out.push({
      key: 'e',
      kind: 'warn',
      text: 'Lokale/testomgeving: bevestigingscodes worden niet naar je e-mailbox gestuurd. E-mailbezorging staat hier uit.',
    });
  } else {
    out.push({
      key: 'e',
      kind: 'warn',
      text: 'E-mailverificatie is momenteel niet beschikbaar. Account aanmaken, inloggen met nieuwe accounts of wachtwoord resetten lukt hier nu niet.',
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
    return 'E-mailverificatie is momenteel niet beschikbaar. Probeer het later opnieuw.';
  }
  return null;
}
