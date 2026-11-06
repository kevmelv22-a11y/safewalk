import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Logo } from '../src/components/Logo';
import { GoogleButton } from '../src/components/GoogleButton';
import { AuthPanel } from '../src/components/AuthPanel';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl } from '../src/lib/safety';

export default function Login() {
  const { signIn } = useAuthActions();
  const providers = useQuery(api.auth.providers);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const e = email.trim().toLowerCase();
      const res = await signIn('password', { flow: 'signIn', email: e, password: pw });
      if (!res.signingIn) router.push({ pathname: '/verify-email', params: { email: e } });
      else router.replace('/');
    } catch (x) {
      const c = errorCode(x);
      if (c === 'EMAIL_NOT_CONFIGURED') setErr('E-mailverificatie is op deze server nog niet geconfigureerd (Resend). Lokaal: zet AUTH_EMAIL_DEV_LOG=true.');
      else if (/EMAIL_/.test(c)) setErr(mapErrorNl(c));
      else setErr('Inloggen mislukt. Controleer je e-mailadres en wachtwoord.');
    }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <AuthPanel>
        <H1>Inloggen</H1>
        <P muted>Log in met je SafeWalk-account. Bij direct gevaar bel je zelf 112 — SafeWalk doet dat niet automatisch.</P>
        <GoogleButton />
        <P muted style={{ textAlign: 'center' }}>of met e-mail</P>
        {providers && !providers.email && (
          <Notice kind="warn">E-mailcodes (verificatie/reset) werken pas met Resend of AUTH_EMAIL_DEV_LOG op de Convex-deployment.</Notice>
        )}
        <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Wachtwoord" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
        {err && <Notice kind="danger">{err}</Notice>}
        <Button title="Inloggen" onPress={submit} loading={busy} disabled={!email || !pw} />
        <Button title="Wachtwoord vergeten?" variant="secondary" onPress={() => router.push('/forgot-password')} />
        <Button title="Account aanmaken" variant="secondary" onPress={() => router.push('/signup')} />
      </AuthPanel>
    </Screen>
  );
}
