import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { RecordingControls } from '../src/components/RecordingControls';
import { errorNl } from '../src/lib/convex';
import { useState } from 'react';

export default function RecordingsScreen() {
  const list = useQuery(api.recordings.listMine) ?? [];
  const remove = useMutation(api.recordings.remove);
  const getUrl = useMutation(api.recordings.getDownloadUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen>
      <H1>Audio-opnames</H1>
      <P muted>Alleen na microfoon-toestemming. Upload via TLS naar Convex-opslag; download alleen met server-ACL. Geen end-to-end encryptie tussen apparaten.</P>
      <RecordingControls />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      <H1>Jouw opnames</H1>
      {list.length === 0 && <P muted>Geen opnames.</P>}
      {list.map((r) => (
        <Card key={r.id}>
          <P>{new Date(r.createdAt).toLocaleString('nl-NL')} · {Math.round(r.byteSize / 1024)} KB</P>
          <Button title="Tijdelijke download-URL" variant="secondary" onPress={async () => {
            try { setMsg((await getUrl({ id: r.id })).url); setErr(null); }
            catch (e) { setErr(errorNl(e)); }
          }} />
          <Button title="Verwijderen" variant="danger" onPress={() => remove({ id: r.id })} />
        </Card>
      ))}
    </Screen>
  );
}
