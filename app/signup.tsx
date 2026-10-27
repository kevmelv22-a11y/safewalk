import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';

export default function SignUp() {
  const { signIn } = useAuthActions();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    if (pw.length < 10) return setErr('Gebruik een wachtwoord van minstens 10 tekens.');
    setBusy(true);
    try { await signIn('password', { flow: 'signUp', email: email.trim(), password: pw, name: name.trim() }); router.replace('/onboarding/location'); }
    catch (e) { setErr(errorCode(e).includes('WEAK_PASSWORD') ? 'Wachtwoord te zwak.' : 'Account aanmaken mislukt. Bestaat dit e-mailadres al?'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Account aanmaken</H1>
      <P muted>Je naam is alleen zichtbaar voor je vertrouwde contacten.</P>
      <Field label="Naam" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Wachtwoord (min. 10 tekens)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Account aanmaken" onPress={submit} loading={busy} disabled={!name || !email || !pw} />
      <Button title="Ik heb al een account" variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
