import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { supabase } from '../src/lib/supabase';

export default function SignUp() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    if (pw.length < 10) return setErr('Gebruik een wachtwoord van minstens 10 tekens.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { display_name: name.trim() } } });
    setBusy(false);
    if (error) return setErr(error.message);
    if (!data.session) setInfo('Bevestig je e-mailadres via de link in je inbox en log daarna in.');
    else router.replace('/onboarding/location');
  };
  return (
    <Screen>
      <H1>Account aanmaken</H1>
      <P muted>Je naam is alleen zichtbaar voor je vertrouwde contacten.</P>
      <Field label="Naam" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Wachtwoord (min. 10 tekens)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      {info && <Notice kind="ok">{info}</Notice>}
      <Button title="Account aanmaken" onPress={submit} loading={busy} disabled={!name || !email || !pw} />
      <Button title="Ik heb al een account" variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
