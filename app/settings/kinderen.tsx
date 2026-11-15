import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../../src/components/ui';
import { Toggle } from '../../src/components/Choice';
import { CHILD_CONSENT_NL } from '../../src/lib/childConsent';
import { errorNl } from '../../src/lib/convex';

export default function KinderenSettings() {
  const list = useQuery(api.childLinks.listForParent);
  const createInvite = useMutation(api.childLinks.createInvite);
  const revoke = useMutation(api.childLinks.revoke);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expires, setExpires] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true); setErr(null); setCode(null);
    try {
      const r = await createInvite({ consentAccepted: consent });
      setCode(r.code);
      setExpires(r.expiresAt);
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Kinderen koppelen</H1>
      <Notice kind="warn">Dit is geen identiteitscontrole en geen wettelijk bewijs van ouderschap. Alleen een SafeWalk-account van 16 jaar of ouder kan toestemming geven. Een vinkje of code van het kind telt niet.</Notice>
      <P>{CHILD_CONSENT_NL}</P>
      <Toggle value={consent} onChange={setConsent} title="Ik heb de tekst gelezen en geef deze toestemming" hint="Pas daarna kun je een koppelcode maken." />
      <Button title="Maak koppelcode (30 minuten geldig)" onPress={make} loading={busy} disabled={!consent} />
      {code && (
        <Notice kind="ok">
          {`Code voor je kind: ${code}. Geldig tot ${new Date(expires!).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })} (Europe/Amsterdam). Geef deze code alleen aan je kind, in de app bij Koppelen aan ouder.`}
        </Notice>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      <P muted>Het kind ziet altijd wie de locatie ontvangt. Locatie loopt alleen met de app open of met de zichtbare locatiemelding. Geen “Altijd”-achtergrondlocatie (Play keurt dat streng, vooral bij kinderen).</P>
      {(list ?? []).map((l) => (
        <Card key={l.linkId}>
          <P>{l.childName}</P>
          <P muted>{l.status === 'pending' ? 'Wacht op de code in de app van het kind' : 'Gekoppeld'}</P>
          {l.status === 'active' && (
            <Button title="Openen" variant="secondary" onPress={() => router.push(`/ouder/${l.linkId}`)} />
          )}
          <Button title="Koppeling intrekken" variant="secondary" onPress={() => { void revoke({ linkId: l.linkId }).catch((e) => setErr(errorNl(e))); }} />
        </Card>
      ))}
    </Screen>
  );
}
