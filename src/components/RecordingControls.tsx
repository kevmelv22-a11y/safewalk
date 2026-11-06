import { useState } from 'react';
import { Platform } from 'react-native';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button, Notice } from './ui';
import { startConsentedRecording, uploadBlob } from '../lib/recording';
import { errorNl } from '../lib/convex';

/** Zichtbare opname-UI met mic-toestemming; upload via Convex storage. */
export function RecordingControls() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const genUrl = useMutation(api.recordings.generateUploadUrl);
  const finalize = useMutation(api.recordings.finalize);
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
      let blob: Blob; let mime: string; let durationMs: number; let byteSize: number;
      if (Platform.OS === 'web' && webRec && 'stopAndRead' in webRec) {
        const f = await webRec.stopAndRead();
        blob = f.blob; mime = f.mime; durationMs = f.durationMs; byteSize = f.byteSize;
        setWebRec(null);
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('Geen URI');
        const res = await fetch(uri);
        blob = await res.blob();
        mime = blob.type || 'audio/m4a';
        durationMs = Math.round((recorder.currentTime || 0) * 1000);
        byteSize = blob.size;
      }
      setActive(false);
      const uploadUrl = await genUrl({});
      const storageId = await uploadBlob(uploadUrl, blob, mime);
      await finalize({ storageId: storageId as Id<'_storage'>, mime, byteSize, durationMs });
      setMsg(`Opgeslagen (${Math.round(byteSize / 1024)} KB). TLS + server-ACL; geen E2E tussen telefoons.`);
    } catch (e) { setErr(errorNl(e)); setActive(false); }
    finally { setBusy(false); }
  };

  return (
    <>
      {active && <Notice kind="danger">🔴 OPNAME BEZIG</Notice>}
      {!active ? <Button title="Start opname (toestemming)" onPress={start} /> : <Button title="Stop en upload" variant="danger" onPress={stop} loading={busy} />}
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </>
  );
}
