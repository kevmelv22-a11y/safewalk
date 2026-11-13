import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { errorNl } from '../../src/lib/convex';
import { referralResultCopy } from '../../src/lib/referralCopy';

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>(); const { isAuthenticated } = useConvexAuth();
  const respondInvitation = useMutation(api.contacts.respondInvitation);
  const [msg, setMsg] = useState<{ k: 'ok' | 'danger'; t: string } | null>(null);
  if (!isAuthenticated) return <Screen><H1>Uitnodiging</H1><P>Log eerst in of maak een account aan, en open de link daarna opnieuw.</P><Button title="Inloggen" onPress={() => router.push('/login')} /></Screen>;
  const respond = async (accept: boolean) => {
    try {
      const r = await respondInvitation({ token, accept });
      const gift = accept ? referralResultCopy(r?.referral) : null;
      setMsg({ k: 'ok', t: accept ? `Geaccepteerd. Je kunt nu per reis worden uitgenodigd om mee te kijken.${gift ? ` ${gift}` : ''}` : 'Uitnodiging geweigerd.' });
    }
    catch (e) { setMsg({ k: 'danger', t: errorNl(e) }); }
  };
  return (
    <Screen>
      <H1>Uitnodiging als vertrouwd contact</H1>
      <P>Als je accepteert, kan deze persoon je vragen mee te kijken tijdens een reis en kun je SOS-meldingen ontvangen.</P>
      <P muted>Je ziet NOOIT automatisch iemands locatie: alleen tijdens een reis waarvoor je expliciet bent gekozen. Je kunt dit altijd beëindigen of de persoon blokkeren.</P>
      {msg ? <Notice kind={msg.k}>{msg.t}</Notice> : (<>
        <Button title="Accepteren" variant="success" onPress={() => respond(true)} />
        <Button title="Weigeren" variant="secondary" onPress={() => respond(false)} />
      </>)}
      <Button title="Naar dashboard" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}
