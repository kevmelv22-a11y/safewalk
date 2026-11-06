import { useMutation, useQuery } from 'convex/react';
import { useAuthToken } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { RecordingControls } from '../src/components/RecordingControls';
import { DecryptedAudioPlayer } from '../src/components/DecryptedAudioPlayer';
import { errorNl } from '../src/lib/convex';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import {
  decryptDownload, encodeFragmentKey, registerMyPublicKey, deleteLocalDek, webKeyStorageWarning,
  fetchCiphertext, getIdentityKeypair, keyFingerprint, KEY_LOSS_WARNING,
} from '../src/lib/recordingUpload';
import { loadLocalDek, getPinnedKey, pinContactKey, unpinContactKey } from '../src/lib/recordingKeys';
import { fromHex } from '../src/lib/recordingCrypto';
import type { Id } from '../convex/_generated/dataModel';

type Playing = { id: string; bytes: Uint8Array; mime: string };

export default function RecordingsScreen() {
  const list = useQuery(api.recordings.listMine) ?? [];
  const shared = useQuery(api.recordings.listSharedWithMe) ?? [];
  const contactKeys = useQuery(api.deviceCrypto.contactPublicKeys) ?? [];
  const me = useQuery(api.profiles.me);
  const authToken = useAuthToken();
  const remove = useMutation(api.recordings.remove);
  const getAccess = useMutation(api.recordings.getAccess);
  const registerKey = useMutation(api.deviceCrypto.registerPublicKey);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [myFp, setMyFp] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, string | null>>({});
  const [pinTick, setPinTick] = useState(0);

  useEffect(() => { getIdentityKeypair().then((k) => setMyFp(k ? keyFingerprint(k.publicKey) : null)); }, []);
  const contactSig = contactKeys.map((c) => c.userId).join(',');
  useEffect(() => {
    (async () => {
      const out: Record<string, string | null> = {};
      for (const c of contactKeys) out[c.userId] = await getPinnedKey(c.userId);
      setPins(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactSig, pinTick]);

  const open = async (id: string) => {
    try {
      if (!authToken || !me?.userId) throw new Error('NOT_AUTHENTICATED');
      setPlaying(null);
      const meta = await getAccess({ id: id as Id<'recordings'> });
      const ciphertext = await fetchCiphertext(id, authToken);
      const pt = await decryptDownload({ ...meta, ciphertext, recordingId: id, myUserId: me.userId });
      setPlaying({ id, bytes: pt, mime: meta.mime });
      setMsg(meta.warning); setErr(null);
    } catch (e) { setErr(errorNl(e)); }
  };

  const register = async (rotate: boolean) => {
    try {
      const kp = await registerMyPublicKey(registerKey, { rotate });
      setMyFp(kp.fingerprint);
      setMsg(kp.created
        ? `Nieuwe sleutel aangemaakt (${kp.fingerprint}). Opnames die voor je oude sleutel waren gedeeld, kun je op dit apparaat niet meer openen.`
        : `Bestaande sleutel opnieuw geregistreerd (${kp.fingerprint}).`);
      setErr(null);
    } catch (e) { setErr(errorNl(e)); }
  };

  const player = (id: string) => playing?.id === id
    ? <DecryptedAudioPlayer bytes={playing.bytes} mime={playing.mime} onClose={() => setPlaying(null)} />
    : null;

  return (
    <Screen>
      <H1>Audio-opnames</H1>
      <P muted>Nieuwe opnames worden op dit apparaat versleuteld (AES-256-GCM) vóór upload; de server krijgt de sleutel niet. Oude opnames zonder versleuteling staan gelabeld als "niet versleuteld". Dit is geen volledig bewezen end-to-end-systeem: de server levert de publieke sleutels van contacten (zie vingerafdrukken hieronder).</P>
      <Notice kind="warn">{KEY_LOSS_WARNING}</Notice>
      {webKeyStorageWarning() && <Notice kind="warn">{webKeyStorageWarning()}</Notice>}

      <H1>Jouw sleutel</H1>
      <P muted>{myFp ? `Vingerafdruk: ${myFp}` : 'Nog geen sleutel op dit apparaat. Zonder sleutel kunnen contacten geen opnames met je delen.'}</P>
      {!myFp && <Button title="Sleutel aanmaken en registreren" variant="secondary" onPress={() => register(false)} />}
      {myFp && <Button title="Sleutel opnieuw registreren" variant="secondary" onPress={() => register(false)} />}
      {myFp && <Button title="Sleutel vervangen (oude opnames voor jou onleesbaar)" variant="danger" onPress={() => register(true)} />}

      <H1>Sleutels van contacten</H1>
      <P muted>Vergelijk de vingerafdruk persoonlijk of via een ander kanaal met je contact. Na verificatie deelt de app alleen nog met precies die sleutel; verandert hij, dan wordt niet gedeeld tot je opnieuw verifieert.</P>
      {contactKeys.length === 0 && <P muted>Geen contacten met een geregistreerde sleutel.</P>}
      {contactKeys.map((c) => {
        const pinned = pins[c.userId];
        const fp = keyFingerprint(fromHex(c.publicKeyX25519));
        const state = !pinned ? 'niet geverifieerd' : pinned === c.publicKeyX25519 ? 'geverifieerd ✓' : '⚠️ SLEUTEL GEWIJZIGD sinds verificatie — er wordt niet gedeeld';
        return (
          <Card key={c.userId}>
            <P>{c.displayName ?? 'Contact'} · {state}</P>
            <P muted>{fp}</P>
            {pinned !== c.publicKeyX25519 && <Button title="Ik heb deze vingerafdruk gecontroleerd" variant="secondary" onPress={async () => { await pinContactKey(c.userId, c.publicKeyX25519); setPinTick((x) => x + 1); }} />}
            {pinned && <Button title="Verificatie intrekken" variant="secondary" onPress={async () => { await unpinContactKey(c.userId); setPinTick((x) => x + 1); }} />}
          </Card>
        );
      })}

      <RecordingControls />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}

      <H1>Jouw opnames</H1>
      {list.length === 0 && <P muted>Geen opnames.</P>}
      {list.map((r) => (
        <Card key={r.id}>
          <P>{new Date(r.createdAt).toLocaleString('nl-NL')} · {Math.round(r.byteSize / 1024)} KB</P>
          <P muted>{r.encryption === 'e2e-v1' ? 'Versleuteld (sleutel alleen op het apparaat dat opnam)' : 'Niet versleuteld (oude opname)'}</P>
          <Button title="Afspelen" variant="secondary" onPress={() => open(r.id)} />
          {player(r.id)}
          {r.encryption === 'e2e-v1' && (
            <Button title="Sleutel voor externe link kopiëren" variant="secondary" onPress={async () => {
              try {
                const dek = await loadLocalDek(r.id);
                if (!dek) { setErr('De sleutel staat niet op dit apparaat (alleen op het apparaat dat opnam).'); return; }
                const frag = encodeFragmentKey(dek);
                dek.fill(0);
                const text = `Plak dit achter de SafeWalk-opnamelink (na het #-teken blijft het op het toestel van de ontvanger):\n${frag}`;
                if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(frag);
                else await Share.share({ message: text });
                setMsg('Sleutel gekopieerd. Wie link + sleutel heeft, kan de opname downloaden; wat gedownload is, kan niet worden ingetrokken.');
                setErr(null);
              } catch (e) { setErr(errorNl(e)); }
            }} />
          )}
          <Button title="Verwijderen" variant="danger" onPress={async () => {
            try {
              if (playing?.id === r.id) setPlaying(null);
              await remove({ id: r.id as Id<'recordings'> });
              await deleteLocalDek(r.id);
              setMsg('Opname en gedeelde sleutels verwijderd. Kopieën die al gedownload zijn, kunnen niet worden ingetrokken.');
            } catch (e) { setErr(errorNl(e)); }
          }} />
        </Card>
      ))}

      <H1>Met mij gedeeld</H1>
      {shared.length === 0 && <P muted>Niemand heeft (versleuteld) een opname met jou gedeeld.</P>}
      {shared.map((r) => (
        <Card key={r.id}>
          <P>{new Date(r.createdAt).toLocaleString('nl-NL')} · {Math.round(r.byteSize / 1024)} KB · versleuteld</P>
          <Button title="Afspelen" variant="secondary" onPress={() => open(r.id)} />
          {player(r.id)}
        </Card>
      ))}
    </Screen>
  );
}
