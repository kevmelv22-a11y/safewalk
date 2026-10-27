import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, Button, Field, Notice } from '../src/components/ui';
import { supabase } from '../src/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr('Inloggen mislukt. Controleer je gegevens.'); else router.replace('/');
  };
  return (
    <Screen>
      <H1>Inloggen</H1>
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Wachtwoord" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Inloggen" onPress={submit} loading={busy} disabled={!email || !pw} />
    </Screen>
  );
}
