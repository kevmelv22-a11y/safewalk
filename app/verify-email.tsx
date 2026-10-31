import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { Logo } from '../src/components/Logo';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorCode } from '../src/lib/convex';
import { mapErrorNl, normalizeCode } from '../src/lib/safety';

export default function VerifyEmail() {
  const { signIn } = useAuthActions();
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const email = String(params.email ?? '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pas doorsturen als de sessie echt actief is (voorkomt terugval naar het welkomstscherm)
  const { isAuthenticated } = useConvexAuth(); const [done, setDone] = useState(false);
  useEffect(() => { if (done && isAuthenticated) router.replace(params.next === 'onboarding' ? '/onboarding/location' : '/'); }, [done, isAuthenticated, params.next]);
  const submit = async () => {
    setErr(null); setInfo(null);
    const c = normalizeCode(code);
    if (!c) return setErr('De code bestaat uit 6 cijfers.');
    setBusy(true);
    try {
      await signIn('password', { flow: 'email-verification', email, code: c });
      setDone(true);
    } catch (x) { const m = mapErrorNl(errorCode(x)); setErr(m === errorCode(x) ? 'De code is onjuist of verlopen.' : m); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(null); setInfo(null);
    try { await signIn('resend-otp-verify', { email }); setInfo('Er is een nieuwe code verstuurd.'); }
    catch (x) { setErr(mapErrorNl(errorCode(x))); }
  };
  return (
    <Screen>
      <Logo size="small" />
      <H1>Bevestig je e-mailadres</H1>
      <P muted>{email ? `We hebben een code van 6 cijfers gestuurd naar ${email}.` : 'We hebben je een code van 6 cijfers gestuurd.'} Vul die hieronder in. De code is 15 minuten geldig.</P>
      <Field label="Code (6 cijfers)" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={7} />
      {err && <Notice kind="danger">{err}</Notice>}
      {info && <Notice kind="info">{info}</Notice>}
      <Button title="Bevestigen" onPress={submit} loading={busy} disabled={!code || !email} />
      <Button title="Nieuwe code sturen" variant="secondary" onPress={resend} disabled={!email} />
      <P muted style={{ fontSize: 13 }}>Geen e-mail ontvangen? Kijk ook in je spam-map.</P>
    </Screen>
  );
}
