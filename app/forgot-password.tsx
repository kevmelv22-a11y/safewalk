import { useState } from 'react';
import { router } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Logo } from '../src/components/Logo';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { isValidEmail, mapErrorNl } from '../src/lib/safety';

export default function ForgotPassword() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) return setErr('Vul een geldig e-mailadres in.');
    setBusy(true);
    try {
      await signIn('password', { flow: 'reset', email: e });
      router.push({ pathname: '/reset-password', params: { email: e } });
    } catch (x) {
      const c = errorCode(x);
      // Geen account-enumeratie: onbekend adres gedraagt zich als succes; echte serverfouten wel tonen.
      if (/EMAIL_NOT_CONFIGURED|EMAIL_SEND_FAILED|RATE_LIMITED/.test(c)) setErr(mapErrorNl(c));
      else router.push({ pathname: '/reset-password', params: { email: e } });
    } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>Wachtwoord vergeten</H1>
      <P muted>Vul je e-mailadres in. Als er een account bij hoort, sturen we je een code van 6 cijfers om een nieuw wachtwoord in te stellen.</P>
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Code versturen" onPress={submit} loading={busy} disabled={!email} />
      <Button title="Terug naar inloggen" variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
