import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Logo } from '../src/components/Logo';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl, normalizeCode } from '../src/lib/safety';

export default function ResetPassword() {
  const { signIn } = useAuthActions();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pas doorsturen als de sessie echt actief is (voorkomt terugval naar het welkomstscherm)
  const { isAuthenticated } = useConvexAuth(); const [done, setDone] = useState(false);
  useEffect(() => { if (done && isAuthenticated) router.replace('/'); }, [done, isAuthenticated]);
  const submit = async () => {
    setErr(null); setInfo(null);
    const c = normalizeCode(code);
    if (!c) return setErr('De code bestaat uit 6 cijfers.');
    if (pw.length < 10) return setErr('Gebruik een wachtwoord van minstens 10 tekens.');
    if (pw !== pw2) return setErr('De wachtwoorden komen niet overeen.');
    setBusy(true);
    try {
      await signIn('password', { flow: 'reset-verification', email: email.trim().toLowerCase(), code: c, newPassword: pw });
      setDone(true);
    } catch (x) { setErr(mapErrorNl(errorCode(x)) === errorCode(x) ? 'De code is onjuist of verlopen.' : mapErrorNl(errorCode(x))); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(null); setInfo(null);
    try { await signIn('password', { flow: 'reset', email: email.trim().toLowerCase() }); setInfo('Als er een account bij dit adres hoort, is er een nieuwe code verstuurd.'); }
    catch (x) { const c = errorCode(x); if (/EMAIL_/.test(c)) setErr(mapErrorNl(c)); else setInfo('Als er een account bij dit adres hoort, is er een nieuwe code verstuurd.'); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>Nieuw wachtwoord instellen</H1>
      <P muted>Vul de code van 6 cijfers uit de e-mail in en kies een nieuw wachtwoord. De code is 15 minuten geldig.</P>
      <Field label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Code (6 cijfers)" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={7} />
      <Field label="Nieuw wachtwoord (min. 10 tekens)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
      <Field label="Herhaal nieuw wachtwoord" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
      {err && <Notice kind="danger">{err}</Notice>}
      {info && <Notice kind="info">{info}</Notice>}
      <Button title="Wachtwoord opslaan" onPress={submit} loading={busy} disabled={!email || !code || !pw || !pw2} />
      <Button title="Nieuwe code sturen" variant="secondary" onPress={resend} disabled={!email} />
    </Screen>
  );
}
