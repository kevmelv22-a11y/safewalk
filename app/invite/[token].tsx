import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { mapErrorNl } from '../../src/lib/safety';
import { useApp } from '../../src/store/app';

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>(); const session = useApp((s) => s.session); const qc = useQueryClient();
  const [msg, setMsg] = useState<{ k: 'ok' | 'danger'; t: string } | null>(null);
  if (!session) return <Screen><H1>Uitnodiging</H1><P>Log eerst in of maak een account aan, en open de link daarna opnieuw.</P><Button title="Inloggen" onPress={() => router.push('/login')} /></Screen>;
  const respond = async (accept: boolean) => {
    const { error } = await supabase.rpc('respond_invitation', { p_token: token, p_accept: accept });
    if (error) return setMsg({ k: 'danger', t: mapErrorNl(error.message) });
    qc.invalidateQueries({ queryKey: ['contacts'] });
    setMsg({ k: 'ok', t: accept ? 'Geaccepteerd. Je kunt nu per reis worden uitgenodigd om mee te kijken.' : 'Uitnodiging geweigerd.' });
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
