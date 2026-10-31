import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Logo } from '../src/components/Logo';
import { GoogleButton } from '../src/components/GoogleButton';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl } from '../src/lib/safety';

export default function SignUp() {
  const { signIn } = useAuthActions();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    if (pw.length < 10) return setErr('Gebruik een wachtwoord van minstens 10 tekens.');
    setBusy(true);
    try {
      const e = email.trim().toLowerCase();
      const res = await signIn('password', { flow: 'signUp', email: e, password: pw, name: name.trim() });
      if (!res.signingIn) router.push({ pathname: '/verify-email', params: { email: e, next: 'onboarding' } });
      else router.replace('/onboarding/location');
    } catch (e) {
      const c = errorCode(e);
      setErr(c.includes('WEAK_PASSWORD') ? 'Wachtwoord te zwak.' : /EMAIL_/.test(c) ? mapErrorNl(c) : 'Account aanmaken mislukt. Bestaat dit e-mailadres al?');
    }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>Account aanmaken</H1>
      <GoogleButton />
      <P muted style={{ textAlign: 'center' }}>of met e-mail</P>
      <P muted>Je naam is alleen zichtbaar voor je vertrouwde contacten.</P>
      <Field label="Naam" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Wachtwoord (min. 10 tekens)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Account aanmaken" onPress={submit} loading={busy} disabled={!name || !email || !pw} />
      <P muted style={{ fontSize: 13 }}>Door een account aan te maken ga je akkoord met de gebruiksvoorwaarden en het privacybeleid.</P>
      <Button title="Gebruiksvoorwaarden en privacybeleid" variant="secondary" onPress={() => router.push('/privacy')} />
      <Button title="Ik heb al een account" variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
