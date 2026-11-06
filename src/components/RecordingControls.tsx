import { useState } from 'react';
import { Platform } from 'react-native';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button, Notice } from './ui';
import { startConsentedRecording } from '../lib/recording';
import { uploadEncryptedRecording, KEY_LOSS_WARNING } from '../lib/recordingUpload';
import { deleteLocalOriginal } from '../lib/playbackFile';
import { useAuthToken } from '@convex-dev/auth/react';
import { errorNl } from '../lib/convex';

/** Zichtbare opname-UI; default e2e-v1 encrypt vóór upload. */
export function RecordingControls() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const me = useQuery(api.profiles.me);
  const contactKeys = useQuery(api.deviceCrypto.contactPublicKeys) ?? [];
  const authToken = useAuthToken();
  const putEnvelopes = useMutation(api.recordings.putEnvelopes);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [webRec, setWebRec] = useState<Awaited<ReturnType<typeof startConsentedRecording>> | null>(null);

  const start = async () => {
    setErr(null); setMsg(null);
    if (Platform.OS === 'web') {
      const r = await startConsentedRecording();
      if ('error' in r) { setErr(r.error); return; }
      setWebRec(r); setActive(true);
      setMsg('OPNAME ACTIEF');
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setErr('Microfoon geweigerd. Geen stille opname.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setActive(true);
    setMsg('OPNAME ACTIEF');
  };

  const stop = async () => {
    setBusy(true); setErr(null);
    try {
      if (!me?.userId) throw new Error('NOT_AUTHENTICATED');
      let blob: Blob; let mime: string; let durationMs: number;
      if (Platform.OS === 'web' && webRec && 'stopAndRead' in webRec) {
        const f = await webRec.stopAndRead();
        blob = f.blob; mime = f.mime; durationMs = f.durationMs;
        setWebRec(null);
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('Geen URI');
        const res = await fetch(uri);
        blob = await res.blob();
        mime = blob.type || 'audio/m4a';
        durationMs = Math.round((recorder.currentTime || 0) * 1000);
      }
      setActive(false);
      const up = await uploadEncryptedRecording({
        blob, mime, userId: me.userId, authToken, contacts: contactKeys, putEnvelopes: putEnvelopes as never, durationMs,
      });
      if (Platform.OS !== 'web') deleteLocalOriginal(recorder.uri);
      setMsg(`${up.note} Opgeslagen (${Math.round(up.byteSize / 1024)} KB), gedeeld met ${up.shared} contact(en).`);
    } catch (e) { setErr(errorNl(e)); setActive(false); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Notice kind="warn">{KEY_LOSS_WARNING}</Notice>
      {active && <Notice kind="danger">🔴 OPNAME BEZIG</Notice>}
      {!active ? <Button title="Start opname (toestemming, E2E-upload)" onPress={start} /> : <Button title="Stop en versleuteld uploaden" variant="danger" onPress={stop} loading={busy} />}
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </>
  );
}
