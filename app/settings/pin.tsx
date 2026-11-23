import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Notice } from '../../src/components/ui';
import { PinPad } from '../../src/components/PinPad';
import { errorNl } from '../../src/lib/convex';

/** PIN wijzigen: vereist altijd de huidige PIN (server-side). Geen open overwrite. */
export default function ChangePin() {
  const { t } = useTranslation();
  const status = useQuery(api.security.pinStatus);
  const setPin = useMutation(api.security.setPin);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status && !status.pinSet) {
    return <Screen><H1>{t('flow.pin.noneTitle')}</H1><P muted>{t('flow.pin.noneBody')}</P></Screen>;
  }

  const submit = async (confirm: string) => {
    setBusy(true); setErr(null);
    try {
      await setPin({ pin: next, confirmPin: confirm, currentPin: current });
      setOk(true);
    } catch (e) {
      const c = errorNl(e);
      setErr(c.includes('PIN_WRONG') || c.includes('Onjuiste') ? t('flow.pin.wrong') : c);
      setStep('current'); setCurrent(''); setNext('');
    } finally { setBusy(false); }
  };

  if (ok) return <Screen><H1>{t('flow.pin.changed')}</H1><Notice kind="ok">{t('flow.pin.changedBody')}</Notice></Screen>;

  return (
    <Screen>
      <H1>{t('flow.pin.changeTitle')}</H1>
      <P muted>{t('flow.pin.changeBody')}</P>
      {step === 'current' && (
        <PinPad title={t('flow.pin.current')} error={err} busy={busy}
          onSubmit={(p) => { setCurrent(p); setErr(null); setStep('new'); }} />
      )}
      {step === 'new' && (
        <PinPad title={t('flow.pin.newCode')} error={err} busy={busy}
          onSubmit={(p) => { setNext(p); setStep('confirm'); }} onCancel={() => setStep('current')} />
      )}
      {step === 'confirm' && (
        <PinPad title={t('flow.pin.confirm')} hint={t('flow.pin.same')} error={err} busy={busy}
          onSubmit={submit} onCancel={() => setStep('new')} />
      )}
    </Screen>
  );
}
