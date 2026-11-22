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

export default function SignUp() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const providers = useQuery(api.auth.providers);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const emailBlocked = providers && !providers.emailDelivery && !providers.emailDevLog;
  const submit = async () => {
    setErr(null);
    if (pw.length < 10) return setErr(t('flow.auth.pwShort'));
    setBusy(true);
    try {
      const e = email.trim().toLowerCase();
      const res = await signIn('password', { flow: 'signUp', email: e, password: pw, name: name.trim() });
      if (!res.signingIn) router.push({ pathname: '/verify-email', params: { email: e, next: 'onboarding' } });
      else router.replace('/onboarding/location');
    } catch (e) {
      const c = errorCode(e);
      setErr(mapAuthEmailError(c) ?? (c.includes('WEAK_PASSWORD') ? t('flow.auth.pwWeak') : /EMAIL_/.test(c) ? mapErrorNl(c) : t('flow.auth.signupFail')));
    }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <AuthPanel>
        <H1>{t('flow.auth.signupTitle')}</H1>
        <AuthCapabilityNotice providers={providers} />
        <GoogleButton />
        {providers?.google ? <P muted style={{ textAlign: 'center' }}>{t('flow.auth.orEmail')}</P> : null}
        <P muted>{t('flow.auth.nameHint')}</P>
        <Field label={t('flow.auth.name')} value={name} onChangeText={setName} autoComplete="name" placeholder={t('flow.auth.firstName')} />
        <Field label={t('flow.auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder={t('flow.auth.emailPh')} />
        <Field label={t('flow.auth.pwMin')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" placeholder="••••••••••" />
        {err && <Notice kind="danger">{err}</Notice>}
        <Button title={t('flow.auth.signupTitle')} onPress={submit} loading={busy} disabled={!name || !email || !pw || !!emailBlocked} />
        <P muted style={{ fontSize: 13 }}>{t('flow.auth.agree')}</P>
        <Button title={t('flow.auth.privacyBtn')} variant="secondary" onPress={() => router.push('/privacy')} />
        <Button title={t('flow.auth.haveAccount')} variant="secondary" onPress={() => router.replace('/login')} />
      </AuthPanel>
    </Screen>
  );
}
