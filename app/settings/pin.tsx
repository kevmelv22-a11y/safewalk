import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Notice } from '../../src/components/ui';
import { PinPad } from '../../src/components/PinPad';
import { errorNl } from '../../src/lib/convex';

/** PIN wijzigen: vereist altijd de huidige PIN (server-side). Geen open overwrite. */
export default function ChangePin() {
  const status = useQuery(api.security.pinStatus);
  const setPin = useMutation(api.security.setPin);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status && !status.pinSet) {
    return <Screen><H1>Geen PIN</H1><P muted>Stel eerst een PIN in via onboarding.</P></Screen>;
  }

  const submit = async (confirm: string) => {
    setBusy(true); setErr(null);
    try {
      await setPin({ pin: next, confirmPin: confirm, currentPin: current });
      setOk(true);
    } catch (e) {
      const c = errorNl(e);
      setErr(c.includes('PIN_WRONG') || c.includes('Onjuiste') ? 'Onjuiste code. Probeer opnieuw.' : c);
      setStep('current'); setCurrent(''); setNext('');
    } finally { setBusy(false); }
  };

  if (ok) return <Screen><H1>PIN gewijzigd</H1><Notice kind="ok">Je nieuwe veiligheids-PIN is actief.</Notice></Screen>;

  return (
    <Screen>
      <H1>PIN wijzigen</H1>
      <P muted>Je huidige PIN is verplicht. De server weigert wijzigingen zonder geldige huidige code.</P>
      {step === 'current' && (
        <PinPad title="Huidige PIN" length={6} error={err} busy={busy}
          onSubmit={(p) => { setCurrent(p); setErr(null); setStep('new'); }} />
      )}
      {step === 'new' && (
        <PinPad title="Nieuwe PIN" length={6} error={err} busy={busy}
          onSubmit={(p) => { setNext(p); setStep('confirm'); }} onCancel={() => setStep('current')} />
      )}
      {step === 'confirm' && (
        <PinPad title="Bevestig nieuwe PIN" length={next.length || 6} error={err} busy={busy}
          onSubmit={submit} onCancel={() => setStep('new')} />
      )}
    </Screen>
  );
}
