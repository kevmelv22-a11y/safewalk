import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../src/components/Logo';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl, normalizeCode } from '../src/lib/safety';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const email = String(params.email ?? '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isAuthenticated } = useConvexAuth(); const [done, setDone] = useState(false);
  useEffect(() => { if (done && isAuthenticated) router.replace(params.next === 'onboarding' ? '/onboarding/location' : '/'); }, [done, isAuthenticated, params.next]);
  const submit = async () => {
    setErr(null); setInfo(null);
    const c = normalizeCode(code);
    if (!c) return setErr(t('flow.auth.codeShort'));
    setBusy(true);
    try {
      await signIn('password', { flow: 'email-verification', email, code: c });
      setDone(true);
    } catch (x) { const m = mapErrorNl(errorCode(x)); setErr(m === errorCode(x) ? t('flow.auth.codeBad') : m); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(null); setInfo(null);
    try { await signIn('resend-otp-verify', { email }); setInfo(t('flow.auth.resent')); }
    catch (x) { setErr(mapErrorNl(errorCode(x))); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>{t('flow.auth.verifyTitle')}</H1>
      <P muted>{email ? t('flow.auth.verifyTo', { email }) : t('flow.auth.verifyPlain')}</P>
      <Field label={t('flow.auth.codeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={7} />
      {err && <Notice kind="danger">{err}</Notice>}
      {info && <Notice kind="info">{info}</Notice>}
      <Button title={t('flow.auth.confirm')} onPress={submit} loading={busy} disabled={!code || !email} />
      <Button title={t('flow.auth.resend')} variant="secondary" onPress={resend} disabled={!email} />
      <P muted style={{ fontSize: 13 }}>{t('flow.auth.spam')}</P>
    </Screen>
  );
}
