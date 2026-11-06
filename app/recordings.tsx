import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { RecordingControls } from '../src/components/RecordingControls';
import { errorNl } from '../src/lib/convex';
import { useState } from 'react';
import { Platform, Share } from 'react-native';
import {
  decryptDownload, encodeFragmentKey, registerMyPublicKey, deleteLocalDek, webKeyStorageWarning,
} from '../src/lib/recordingUpload';
import { loadLocalDek } from '../src/lib/recordingKeys';
import type { Id } from '../convex/_generated/dataModel';

export default function RecordingsScreen() {
  const list = useQuery(api.recordings.listMine) ?? [];
  const shared = useQuery(api.recordings.listSharedWithMe) ?? [];
  const remove = useMutation(api.recordings.remove);
  const getUrl = useMutation(api.recordings.getDownloadUrl);
  const registerKey = useMutation(api.deviceCrypto.registerPublicKey);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Screen>
      <H1>Audio-opnames</H1>
      <P muted>Default: AES-256-GCM (e2e-v1) op het apparaat vóór upload — server ziet geen content-sleutel. Legacy (none) blijft expliciet gelabeld. Intrekken/verwijderen stopt nieuwe toegang; reeds gedownloade kopieën niet.</P>
      {webKeyStorageWarning() && <Notice kind="warn">{webKeyStorageWarning()}</Notice>}
      <Button title="Registreer mijn publieke sleutel" variant="secondary" onPress={async () => {
        try {
          const kp = await registerMyPublicKey(registerKey);
          setMsg(`Publieke sleutel geregistreerd (keyId ${kp.keyId}). Rotatie: opnieuw genereren + contacten opnieuw wrappen.`);
          setErr(null);
        } catch (e) { setErr(errorNl(e)); }
      }} />
      <RecordingControls />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      <H1>Jouw opnames</H1>
      {list.length === 0 && <P muted>Geen opnames.</P>}
      {list.map((r) => (
        <Card key={r.id}>
          <P>{new Date(r.createdAt).toLocaleString('nl-NL')} · {Math.round(r.byteSize / 1024)} KB</P>
          <P muted>
            {r.encryption === 'e2e-v1'
              ? 'Versleuteling: e2e-v1 (AES-GCM, sleutel niet op server)'
              : 'Versleuteling: none — LEGACY plaintext (niet E2E)'}
          </P>
          <Button title="Download / ontsleutel (tijdelijke URL)" variant="secondary" onPress={async () => {
            try {
              const meta = await getUrl({ id: r.id });
              if (!meta.url) throw new Error('NO_URL');
              const res = await fetch(meta.url);
              const buf = new Uint8Array(await res.arrayBuffer());
              if (meta.encryption === 'none') {
                setMsg(`LEGACY plaintext opgehaald (${buf.length} B). ${meta.warning}`);
              } else {
                const pt = await decryptDownload({
                  ciphertext: buf,
                  encryption: meta.encryption,
                  userIdOwner: meta.ownerId,
                  clientUploadId: meta.clientUploadId,
                  isOwner: meta.isOwner,
                  recordingId: r.id,
                  envelope: meta.envelope,
                });
                setMsg(`E2E ontsleuteld: ${pt.length} B plaintext. ${meta.warning}`);
              }
              setErr(null);
            } catch (e) { setErr(errorNl(e)); }
          }} />
          {r.encryption === 'e2e-v1' && (
            <Button title="Fragment-sleutel kopiëren (extern, opt-in)" variant="secondary" onPress={async () => {
              try {
                const dek = await loadLocalDek(r.id);
                if (!dek) { setErr('Geen lokale DEK — alleen op het apparaat dat uploadde.'); return; }
                const frag = encodeFragmentKey(dek);
                const text = `Plak dit ACHTER de tracking recording-play URL (alleen fragment, geen query):\n${frag}\nSleutel gaat niet naar de server als je de fragment-conventie volgt.`;
                if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(frag);
                else await Share.share({ message: text });
                setMsg('Fragment-sleutel klaar. Deel NOOIT in query/path/logs. Gedownloade audio blijft bij ontvanger.');
                setErr(null);
              } catch (e) { setErr(errorNl(e)); }
            }} />
          )}
          <Button title="Verwijderen (+ lokale DEK)" variant="danger" onPress={async () => {
            try {
              await remove({ id: r.id as Id<'recordings'> });
              await deleteLocalDek(r.id);
              setMsg('Opname + envelopes verwijderd; lokale DEK gewist. Gedownloade kopieën elders blijven.');
            } catch (e) { setErr(errorNl(e)); }
          }} />
        </Card>
      ))}
      <H1>Met mij gedeeld</H1>
      {shared.length === 0 && <P muted>Niemand heeft (versleuteld) een opname met jou gedeeld.</P>}
      {shared.map((r) => (
        <Card key={r.id}>
          <P>{new Date(r.createdAt).toLocaleString('nl-NL')} · {Math.round(r.byteSize / 1024)} KB · e2e-v1</P>
          <Button title="Ophalen en ontsleutelen" variant="secondary" onPress={async () => {
            try {
              const meta = await getUrl({ id: r.id });
              if (!meta.url) throw new Error('NO_URL');
              const res = await fetch(meta.url);
              const buf = new Uint8Array(await res.arrayBuffer());
              const pt = await decryptDownload({
                ciphertext: buf, encryption: meta.encryption, userIdOwner: meta.ownerId,
                clientUploadId: meta.clientUploadId, isOwner: meta.isOwner, recordingId: r.id, envelope: meta.envelope,
              });
              setMsg(`E2E ontsleuteld: ${pt.length} B. ${meta.warning}`);
              setErr(null);
            } catch (e) { setErr(errorNl(e)); }
          }} />
        </Card>
      ))}
    </Screen>
  );
}
