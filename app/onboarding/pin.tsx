import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Notice, Card } from '../../src/components/ui';
import { PinPad } from '../../src/components/PinPad';
import { errorNl } from '../../src/lib/convex';

export default function OnboardingPin() {
  const { t } = useTranslation();
  const setPin = useMutation(api.security.setPin);
  const setTorch = useMutation(api.security.setTorchOptIn);
  const status = useQuery(api.security.pinStatus);
  const [step, setStep] = useState<'pin' | 'confirm' | 'torch'>('pin');
  const [first, setFirst] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (confirm: string) => {
    setBusy(true); setErr(null);
    try {
      await setPin({ pin: first, confirmPin: confirm });
      setStep('torch');
    } catch (e) {
      setErr(errorNl(e));
      setStep('pin'); setFirst('');
    } finally { setBusy(false); }
  };

  if (status?.pinSet && step !== 'torch') {
    return (
      <Screen>
        <H1>{t('flow.onboard.pinReadyTitle')}</H1>
        <P muted>{t('flow.onboard.pinReadyBody')}</P>
        <Button title={t('flow.onboard.further')} onPress={() => router.push('/onboarding/settings')} />
      </Screen>
    );
  }

  if (step === 'torch') {
    return (
      <Screen>
        <H1>{t('flow.onboard.torchTitle')}</H1>
        <Notice kind="warn">{t('flow.onboard.torchWarn')}</Notice>
        <P muted>{t('flow.onboard.torchBody')}</P>
        <Button title={t('flow.onboard.torchOn')} onPress={async () => { await setTorch({ optIn: true }); router.push('/onboarding/settings'); }} />
        <Button title={t('flow.onboard.torchOff')} variant="secondary" onPress={async () => { await setTorch({ optIn: false }); router.push('/onboarding/settings'); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <P>{t('flow.onboard.pinExplain')}</P>
      </Card>
      {step === 'pin' ? (
        <PinPad title={t('flow.onboard.choosePin')} error={err} busy={busy}
          onSubmit={(p) => { setFirst(p); setErr(null); setStep('confirm'); }} />
      ) : (
        <PinPad title={t('flow.onboard.confirmPin')} hint={t('flow.onboard.sameHint')} error={err} busy={busy}
          onSubmit={save} onCancel={() => { setStep('pin'); setFirst(''); setErr(null); }} />
      )}
    </Screen>
  );
}
