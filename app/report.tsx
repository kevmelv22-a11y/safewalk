import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { errorNl } from '../src/lib/convex';

const REASONS = [['stalking', 'Stalking / ongewenst volgen'], ['harassment', 'Intimidatie of bedreiging'], ['spam', 'Spam'], ['other', 'Iets anders']] as const;
export default function Report() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const report = useMutation(api.contacts.report); const block = useMutation(api.contacts.block);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>('stalking');
  const [details, setDetails] = useState(''); const [alsoBlock, setAlsoBlock] = useState(true);
  const [msg, setMsg] = useState<{ k: 'ok' | 'danger'; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await report({ userId: userId as Id<'users'>, reason, details: details.trim() || undefined });
      if (alsoBlock) await block({ userId: userId as Id<'users'> });
      setMsg({ k: 'ok', t: `Melding ontvangen${alsoBlock ? ' en persoon geblokkeerd' : ''}. Ons team bekijkt dit; je locatie wordt nooit met beheerders gedeeld.` });
    } catch (e) { setMsg({ k: 'danger', t: errorNl(e) }); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Misbruik melden{name ? `: ${name}` : ''}</H1>
      <Notice kind="warn">Voel je je bedreigd of in gevaar? Bel 112. Voor aangifte: politie 0900-8844.</Notice>
      <P>Reden</P>
      <View style={{ gap: 8 }}>{REASONS.map(([k, l]) => <Button key={k} title={l} variant={reason === k ? 'primary' : 'secondary'} onPress={() => setReason(k)} />)}</View>
      <Field label="Toelichting (optioneel, max. 2000 tekens)" value={details} onChangeText={(t) => setDetails(t.slice(0, 2000))} multiline />
      <Button title={alsoBlock ? '✓ Ook blokkeren' : 'Niet blokkeren'} variant={alsoBlock ? 'success' : 'secondary'} onPress={() => setAlsoBlock(!alsoBlock)} />
      {msg ? <><Notice kind={msg.k}>{msg.t}</Notice><Button title="Terug" variant="secondary" onPress={() => router.back()} /></>
        : <Button title="Melding versturen" variant="danger" onPress={submit} loading={busy} />}
    </Screen>
  );
}
