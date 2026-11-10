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
    return <Screen><H1>Geen veiligheidscode</H1><P muted>Stel eerst een veiligheidscode in via onboarding. Cijfers en letters, 4–8 tekens.</P></Screen>;
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

  if (ok) return <Screen><H1>Code gewijzigd</H1><Notice kind="ok">Je nieuwe veiligheidscode is actief. Hoofdletters tellen mee.</Notice></Screen>;

  return (
    <Screen>
      <H1>Veiligheidscode wijzigen</H1>
      <P muted>Je huidige code is verplicht. De server weigert wijzigingen zonder die code. 4–8 tekens, cijfers en letters. Hoofdletters tellen mee. Een oude cijfercode blijft geldig tot je hem wijzigt.</P>
      {step === 'current' && (
        <PinPad title="Huidige code" error={err} busy={busy}
          onSubmit={(p) => { setCurrent(p); setErr(null); setStep('new'); }} />
      )}
      {step === 'new' && (
        <PinPad title="Nieuwe code" error={err} busy={busy}
          onSubmit={(p) => { setNext(p); setStep('confirm'); }} onCancel={() => setStep('current')} />
      )}
      {step === 'confirm' && (
        <PinPad title="Bevestig nieuwe code" hint="Zelfde tekens, zelfde hoofdletters." error={err} busy={busy}
          onSubmit={submit} onCancel={() => setStep('new')} />
      )}
    </Screen>
  );
}
