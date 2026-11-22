import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../src/components/Logo';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl, normalizeCode } from '../src/lib/safety';

export default function ResetPassword() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isAuthenticated } = useConvexAuth(); const [done, setDone] = useState(false);
  useEffect(() => { if (done && isAuthenticated) router.replace('/'); }, [done, isAuthenticated]);
  const submit = async () => {
    setErr(null); setInfo(null);
    const c = normalizeCode(code);
    if (!c) return setErr(t('flow.auth.codeShort'));
    if (pw.length < 10) return setErr(t('flow.auth.pwShort'));
    if (pw !== pw2) return setErr(t('flow.auth.mismatch'));
    setBusy(true);
    try {
      await signIn('password', { flow: 'reset-verification', email: email.trim().toLowerCase(), code: c, newPassword: pw });
      setDone(true);
    } catch (x) { setErr(mapErrorNl(errorCode(x)) === errorCode(x) ? t('flow.auth.codeBad') : mapErrorNl(errorCode(x))); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(null); setInfo(null);
    try { await signIn('password', { flow: 'reset', email: email.trim().toLowerCase() }); setInfo(t('flow.auth.resetSent')); }
    catch (x) { const c = errorCode(x); if (/EMAIL_/.test(c)) setErr(mapErrorNl(c)); else setInfo(t('flow.auth.resetSent')); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>{t('flow.auth.resetTitle')}</H1>
      <P muted>{t('flow.auth.resetBody')}</P>
      <Field label={t('flow.auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('flow.auth.codeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={7} />
      <Field label={t('flow.auth.newPw')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
      <Field label={t('flow.auth.repeatPw')} value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      {info && <Notice kind="info">{info}</Notice>}
      <Button title={t('flow.auth.savePw')} onPress={submit} loading={busy} disabled={!email || !code || !pw || !pw2} />
      <Button title={t('flow.auth.resend')} variant="secondary" onPress={resend} disabled={!email} />
    </Screen>
  );
}
