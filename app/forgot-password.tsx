import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../convex/_generated/api';
import { Logo } from '../src/components/Logo';
import { AuthPanel } from '../src/components/AuthPanel';
import { AuthCapabilityNotice, mapAuthEmailError } from '../src/components/AuthCapabilityNotice';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { isValidEmail, mapErrorNl } from '../src/lib/safety';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const providers = useQuery(api.auth.providers);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const emailBlocked = providers && !providers.emailDelivery && !providers.emailDevLog;
  const submit = async () => {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) return setErr(t('flow.auth.emailInvalid'));
    setBusy(true);
    try {
      await signIn('password', { flow: 'reset', email: e });
      router.push({ pathname: '/reset-password', params: { email: e } });
    } catch (x) {
      const c = errorCode(x);
      // Geen account-enumeratie: onbekend adres gedraagt zich als succes; echte serverfouten wel tonen.
      if (/EMAIL_NOT_CONFIGURED|EMAIL_SEND_FAILED|RATE_LIMITED/.test(c)) {
        setErr(mapAuthEmailError(c) ?? mapErrorNl(c));
      } else router.push({ pathname: '/reset-password', params: { email: e } });
    } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <AuthPanel>
        <H1>{t('flow.auth.forgotTitle')}</H1>
        <P muted>{t('flow.auth.forgotBody')}</P>
        <AuthCapabilityNotice providers={providers} />
        <Field label={t('flow.auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        {err && <Notice kind="danger">{err}</Notice>}
        <Button title={t('flow.auth.sendCode')} onPress={submit} loading={busy} disabled={!email || !!emailBlocked} />
        <Button title={t('flow.auth.backLogin')} variant="secondary" onPress={() => router.replace('/login')} />
      </AuthPanel>
    </Screen>
  );
}
