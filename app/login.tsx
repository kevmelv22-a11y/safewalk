import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Logo } from '../src/components/Logo';
import { GoogleButton } from '../src/components/GoogleButton';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl } from '../src/lib/safety';

export default function Login() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const e = email.trim().toLowerCase();
      const res = await signIn('password', { flow: 'signIn', email: e, password: pw });
      // Nog niet geverifieerd: Convex Auth heeft een code gestuurd
      if (!res.signingIn) router.push({ pathname: '/verify-email', params: { email: e } });
      else router.replace('/');
    } catch (x) { const c = errorCode(x); setErr(/EMAIL_/.test(c) ? mapErrorNl(c) : 'Inloggen mislukt. Controleer je gegevens.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>Inloggen</H1>
      <GoogleButton />
      <P muted style={{ textAlign: 'center' }}>of met e-mail</P>
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Wachtwoord" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Inloggen" onPress={submit} loading={busy} disabled={!email || !pw} />
      <Button title="Wachtwoord vergeten?" variant="secondary" onPress={() => router.push('/forgot-password')} />
    </Screen>
  );
}
