import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Field, Notice, Card } from '../src/components/ui';
import { errorNl } from '../src/lib/convex';
import { useTheme } from '../src/lib/theme';

type Msg = { role: 'user' | 'assistant'; content: string };
export default function Assistant() {
  const t = useTheme();
  const avail = useQuery(api.assistant.availability);
  const ask = useAction(api.assistant.ask);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    const next: Msg[] = [...msgs, { role: 'user', content: input.trim() }];
    setMsgs(next); setInput(''); setBusy(true); setErr(null);
    try {
      const r = await ask({ messages: next });
      if (r.disabled) setErr('De assistent is niet ingeschakeld op deze server.');
      if (r.notice) setNotice(r.notice);
      if (r.reply) setMsgs([...next, { role: 'assistant', content: r.reply }]);
    } catch (e) { setErr(errorNl(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Veiligheidsassistent</H1>
      <Notice kind="warn">De assistent geeft algemene tips en is geen hulpdienst. Hij kan geen noodsituaties beoordelen en belt niemand. Bij gevaar: bel zelf 112 of gebruik SOS.</Notice>
      <Button title="📞 Bel 112" variant="danger" onPress={() => Linking.openURL('tel:112')} />
      {avail && !avail.enabled && <Notice kind="info">De AI-assistent is (nog) niet beschikbaar.</Notice>}
      {avail && avail.enabled && !avail.premium && <><Notice kind="info">De assistent is onderdeel van Premium.</Notice><Button title="Bekijk Premium" variant="secondary" onPress={() => router.push('/premium')} /></>}
      {notice && <Notice kind="danger">{notice}</Notice>}
      {msgs.map((m, i) => (
        <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
          <Card style={m.role === 'user' ? { backgroundColor: t.purple, borderColor: t.purple } : undefined}><P style={m.role === 'user' ? { color: '#fff' } : undefined}>{m.content}</P></Card>
        </View>
      ))}
      {err && <Notice kind="danger">{err}</Notice>}
      {avail?.enabled && avail.premium && (<>
        <Field label="Je vraag" value={input} onChangeText={setInput} multiline placeholder="Bijv. hoe bereid ik een avondwandeling voor?" />
        <Button title="Vraag stellen" onPress={send} loading={busy} disabled={!input.trim()} />
        <P muted style={{ fontSize: 13 }}>Gesprekken worden niet opgeslagen. Je vraag wordt via de server naar OpenAI gestuurd; deel geen locatie of persoonsgegevens.</P>
      </>)}
    </Screen>
  );
}
