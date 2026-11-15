import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { PinPad } from '../../src/components/PinPad';
import { errorNl } from '../../src/lib/convex';
import { confirmAction } from '../../src/lib/confirm';

/**
 * Dwangcode: tweede code. In de app ziet het eruit alsof het alarm of de reis stopt.
 * Contacten en kijkers krijgen stil een SOS. De UI zegt dat nooit hardop op dit scherm
 * ná gebruik; hier alleen uitleg bij het instellen.
 */
export default function DuressCode() {
  const status = useQuery(api.security.pinStatus);
  const setDuress = useMutation(api.security.setDuress);
  const clearDuress = useMutation(api.security.clearDuress);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<'set' | 'cleared' | null>(null);
  const [busy, setBusy] = useState(false);

  if (status && !status.pinSet) {
    return <Screen><H1>Eerst een veiligheidscode</H1><P muted>Stel eerst je gewone veiligheidscode in. Daarna kun je een aparte dwangcode kiezen.</P></Screen>;
  }

  const submit = async (confirm: string) => {
    setBusy(true); setErr(null);
    try {
      await setDuress({ currentPin: current, duressPin: next, confirmPin: confirm });
      setOk('set');
    } catch (e) {
      setErr(errorNl(e));
      setStep('current'); setCurrent(''); setNext('');
    } finally { setBusy(false); }
  };

  const onClear = () => confirmAction(
    'Dwangcode verwijderen',
    'Daarna werkt alleen nog je gewone veiligheidscode. Een dwangcode die al is gebruikt, maakt eerder verstuurde SOS-meldingen niet ongedaan.',
    'Verwijderen',
    async () => {
      setBusy(true); setErr(null);
      try {
        // We vragen de huidige code opnieuw via de pad als die nog niet is ingevuld.
        if (!current) { setStep('current'); setErr('Voer eerst je veiligheidscode in om de dwangcode te verwijderen.'); setBusy(false); return; }
        await clearDuress({ currentPin: current });
        setOk('cleared');
      } catch (e) { setErr(errorNl(e)); }
      finally { setBusy(false); }
    },
  );

  if (ok === 'set') return <Screen><H1>Dwangcode actief</H1><Notice kind="ok">Je dwangcode is ingesteld. Voer hem alleen in als je gedwongen wordt het alarm of de reis te stoppen. In de app lijkt het dan gestopt; je contacten krijgen een SOS. SafeWalk kan niet garanderen dat die melding aankomt.</Notice></Screen>;
  if (ok === 'cleared') return <Screen><H1>Dwangcode verwijderd</H1><Notice kind="ok">Er is geen dwangcode meer. Je gewone veiligheidscode werkt zoals eerder.</Notice></Screen>;

  return (
    <Screen>
      <H1>Dwangcode</H1>
      <Notice kind="warn">
        Een dwangcode is een tweede code, anders dan je veiligheidscode. Als je die invoert waar je anders het alarm stopt of “veilig aangekomen” bevestigt, lijkt de app gestopt. Tegelijk gaat er stil een SOS naar je vertrouwde contacten en naar kijkers van een meekijklink, met je laatst bekende locatie als die bekend is.
      </Notice>
      <P muted>
        Het alarmgeluid stopt, en bij “veilig aangekomen” verdwijnt de reis van jouw dashboard (inclusief de melding “SafeWalk deelt je locatie”). Live updates kunnen daardoor stoppen, zodat je telefoon er gewoon uitziet. Kijkers houden de SOS en de laatst bekende locatie. SafeWalk is geen hulpdienst en garandeert niet dat meldingen aankomen.
      </P>
      {status?.duressSet && <Notice kind="info">Er staat al een dwangcode. Hieronder kun je een nieuwe instellen of de huidige verwijderen.</Notice>}
      {step === 'current' && (
        <PinPad title="Je veiligheidscode (niet de dwangcode)" error={err} busy={busy}
          onSubmit={(p) => { setCurrent(p); setErr(null); setStep('new'); }} />
      )}
      {step === 'new' && (
        <PinPad title="Kies een dwangcode" hint="4–8 tekens, anders dan je veiligheidscode. Hoofdletters tellen mee." error={err} busy={busy}
          onSubmit={(p) => { setNext(p); setStep('confirm'); }} onCancel={() => setStep('current')} />
      )}
      {step === 'confirm' && (
        <PinPad title="Bevestig de dwangcode" hint="Zelfde tekens, zelfde hoofdletters." error={err} busy={busy}
          onSubmit={submit} onCancel={() => setStep('new')} />
      )}
      {status?.duressSet && current.length > 0 && (
        <Card>
          <Button title="Dwangcode verwijderen" variant="danger" loading={busy} onPress={onClear} />
        </Card>
      )}
    </Screen>
  );
}
