import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../convex/_generated/api';
import { Logo } from '../src/components/Logo';
import { GoogleButton } from '../src/components/GoogleButton';
import { AuthPanel } from '../src/components/AuthPanel';
import { AuthCapabilityNotice, mapAuthEmailError } from '../src/components/AuthCapabilityNotice';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl } from '../src/lib/safety';
import { useLocale } from '../src/i18n/provider';

export default function Login() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const { signIn } = useAuthActions();
  const providers = useQuery(api.auth.providers);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const emailBlocked = providers && !providers.emailDelivery && !providers.emailDevLog;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const e = email.trim().toLowerCase();
      const res = await signIn('password', { flow: 'signIn', email: e, password: pw });
      if (!res.signingIn) router.push({ pathname: '/verify-email', params: { email: e } });
      else router.replace('/');
    } catch (x) {
      const c = errorCode(x);
      setErr(mapAuthEmailError(c) ?? (/EMAIL_/.test(c) ? mapErrorNl(c) : t('flow.auth.loginFail')));
    }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <AuthPanel>
        <H1>{t('flow.auth.loginTitle')}</H1>
        <P muted>{t('flow.auth.loginBody', { number: emergencyDigits })}</P>
        <AuthCapabilityNotice providers={providers} />
        <GoogleButton />
        {providers?.google ? <P muted style={{ textAlign: 'center' }}>{t('flow.auth.orEmail')}</P> : null}
        <Field label={t('flow.auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder={t('flow.auth.emailPh')} />
        <Field label={t('flow.auth.password')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" placeholder="••••••••••" />
        {err && <Notice kind="danger">{err}</Notice>}
        <Button title={t('flow.auth.loginTitle')} onPress={submit} loading={busy} disabled={!email || !pw || !!emailBlocked} />
        <Button title={t('flow.auth.forgot')} variant="secondary" onPress={() => router.push('/forgot-password')} disabled={!!emailBlocked} />
        <Button title={t('flow.auth.signupTitle')} variant="secondary" onPress={() => router.push('/signup')} />
      </AuthPanel>
    </Screen>
  );
}
