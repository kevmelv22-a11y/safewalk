import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Notice, Card } from '../../src/components/ui';
import { PinPad } from '../../src/components/PinPad';
import { errorNl } from '../../src/lib/convex';

export default function OnboardingPin() {
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
      const c = errorNl(e);
      setErr(c.includes('PIN_INVALID') ? 'Gebruik 4–8 cijfers en bevestig hetzelfde.' : c);
      setStep('pin'); setFirst('');
    } finally { setBusy(false); }
  };

  if (status?.pinSet && step !== 'torch') {
    return (
      <Screen>
        <H1>PIN al ingesteld</H1>
        <P muted>Je veiligheids-PIN staat klaar. Je kunt doorgaan of later wijzigen in Instellingen.</P>
        <Button title="Verder" onPress={() => router.push('/onboarding/settings')} />
      </Screen>
    );
  }

  if (step === 'torch') {
    return (
      <Screen>
        <H1>Zaklamp-strobe (optioneel)</H1>
        <Notice kind="warn">Knipperend licht kan epilepsie of migraines triggeren bij fotosensitieve mensen. Standaard staat strobe UIT. Frequentie ≈ 2× per seconde als je dit aanzet.</Notice>
        <P muted>De strobe werkt alleen op een apparaat met camera/flash, terwijl de app op de voorgrond is. Op web en zonder toestemming is strobe niet beschikbaar; het alarmgeluid wel.</P>
        <Button title="Strobe aanzetten (ik begrijp het risico)" onPress={async () => { await setTorch({ optIn: true }); router.push('/onboarding/settings'); }} />
        <Button title="Nee, alleen alarmgeluid" variant="secondary" onPress={async () => { await setTorch({ optIn: false }); router.push('/onboarding/settings'); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <P>Deze PIN stopt later het gevaar-alarm en bevestigt “Ik ben veilig aangekomen”. Kies 4–8 cijfers die alleen jij kent. De PIN wordt versleuteld op de server opgeslagen (nooit als leesbare tekst).</P>
      </Card>
      {step === 'pin' ? (
        <PinPad title="Kies veiligheids-PIN" hint="4 tot 6 cijfers (OK bij korter dan 6)" length={6} error={err} busy={busy}
          onSubmit={(p) => { setFirst(p); setErr(null); setStep('confirm'); }} />
      ) : (
        <PinPad title="Bevestig PIN" hint="Voer dezelfde code nog eens in" length={first.length || 6} error={err} busy={busy}
          onSubmit={save} onCancel={() => { setStep('pin'); setFirst(''); setErr(null); }} />
      )}
    </Screen>
  );
}
