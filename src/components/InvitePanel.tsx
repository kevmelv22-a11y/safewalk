import { useState } from 'react';
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, Field, Notice, P } from './ui';
import { errorNl } from '../lib/convex';
import { parseInviteToken } from '../lib/safety';

export function InvitePanel() {
  const createInvitation = useMutation(api.contacts.createInvitation);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [code, setCode] = useState('');
  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const token = await createInvitation();
      await Share.share({ message: `Wil je mijn vertrouwde contact zijn in SafeWalk? Open deze link (7 dagen geldig): ${Linking.createURL(`/invite/${token}`)}` });
    } catch (e) { setErr(errorNl(e)); } finally { setBusy(false); }
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
