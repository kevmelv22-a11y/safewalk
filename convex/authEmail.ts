import { Email } from '@convex-dev/auth/providers/Email';
import { ConvexError } from 'convex/values';

export const CODE_TTL_SECONDS = 15 * 60;

/** 6-cijferige code met crypto-randomness (geen Math.random). */
export async function generateCode(): Promise<string> {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export type Purpose = 'verify' | 'reset';
export const SUBJECTS: Record<Purpose, string> = {
  verify: 'Je SafeWalk-verificatiecode',
  reset: 'Je SafeWalk-code om je wachtwoord te herstellen',
};

export function emailBody(purpose: Purpose, code: string) {
  const intro = purpose === 'verify' ? 'Gebruik deze code om je e-mailadres te bevestigen:' : 'Gebruik deze code om een nieuw wachtwoord in te stellen:';
  const text = `${intro}\n\n${code}\n\nDe code is 15 minuten geldig. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.\n\n– SafeWalk`;
  const html = `<p>${intro}</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>De code is 15 minuten geldig. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</p><p>– SafeWalk</p>`;
  return { text, html };
}

/**
 * Verstuurt de code via Resend (gratis tier). Zonder RESEND_API_KEY:
 * - met AUTH_EMAIL_DEV_LOG=true (alleen lokaal/dev): code wordt server-side gelogd;
 * - anders: fout EMAIL_NOT_CONFIGURED — er wordt nooit succes geveinsd.
 */
export async function sendCode(purpose: Purpose, to: string, code: string, env: Record<string, string | undefined> = process.env) {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.AUTH_EMAIL_DEV_LOG === 'true') {
      console.log(`[auth-email DEV] ${purpose}-code voor ${to}: ${code}`);
      return { delivered: false as const, devLogged: true as const };
    }
    throw new ConvexError('EMAIL_NOT_CONFIGURED');
  }
  const { text, html } = emailBody(purpose, code);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM ?? 'SafeWalk <onboarding@resend.dev>', to: [to], subject: SUBJECTS[purpose], text, html }),
  });
  if (!res.ok) {
    console.error(`[auth-email] Resend fout ${res.status}`);
    throw new ConvexError('EMAIL_SEND_FAILED');
  }
  return { delivered: true as const, devLogged: false as const };
}

const otpProvider = (id: string, purpose: Purpose) =>
  Email({
    id,
    maxAge: CODE_TTL_SECONDS,
    generateVerificationToken: generateCode,
    async sendVerificationRequest({ identifier, token }) {
      await sendCode(purpose, identifier, token);
    },
  });

export const ResendOTPVerify = otpProvider('resend-otp-verify', 'verify');
export const ResendOTPReset = otpProvider('resend-otp-reset', 'reset');
