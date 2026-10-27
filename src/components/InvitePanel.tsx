import { useState } from 'react';
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Button, Card, Field, Notice, P } from './ui';
import { supabase } from '../lib/supabase';
import { mapErrorNl, parseInviteToken } from '../lib/safety';

export function InvitePanel() {
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [code, setCode] = useState('');
  const create = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('create_invitation');
    setBusy(false);
    if (error) return setErr(mapErrorNl(error.message));
    const link = Linking.createURL(`/invite/${data}`);
    await Share.share({ message: `Wil je mijn vertrouwde contact zijn in SafeWalk? Open deze link (7 dagen geldig): ${link}` });
  };
  return (
    <Card>
      <P>Uitnodigen</P>
      <P muted>De link is persoonlijk en 7 dagen geldig. Deel hem alleen met de persoon die je wilt uitnodigen.</P>
      <Button title="Uitnodigingslink delen" onPress={create} loading={busy} />
      <Field label="Uitnodiging ontvangen? Plak de link of code" value={code} onChangeText={setCode} autoCapitalize="none" />
      <Button title="Uitnodiging openen" variant="secondary" disabled={!code} onPress={() => {
        const tok = parseInviteToken(code); if (!tok) return setErr('Ongeldige link of code.'); router.push(`/invite/${tok}`);
      }} />
      {err && <Notice kind="danger">{err}</Notice>}
    </Card>
  );
}
