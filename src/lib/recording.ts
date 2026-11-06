import { Platform } from 'react-native';

export type ActiveRecording = {
  stopAndRead: () => Promise<{ blob: Blob; mime: string; durationMs: number; byteSize: number }>;
};

/** Start na expliciete mic-toestemming. Bij weigering: fout, géén stille opname. */
export async function startConsentedRecording(): Promise<ActiveRecording | { error: string }> {
  if (Platform.OS === 'web') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.start(250);
      const started = Date.now();
      return {
        stopAndRead: async () => {
          await new Promise<void>((res) => { mr.onstop = () => res(); mr.stop(); });
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          return { blob, mime: blob.type || 'audio/webm', durationMs: Date.now() - started, byteSize: blob.size };
        },
      };
    } catch {
      return { error: 'Microfoon geweigerd of niet beschikbaar. Geen stille opname — locatie/SOS kunnen apart.' };
    }
  }
  try {
    const audio = await import('expo-audio');
    const perm = await audio.requestRecordingPermissionsAsync();
    if (!perm.granted) return { error: 'Microfoon geweigerd. Geen stille opname.' };
    await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const RecorderCtor = (audio as unknown as {
      AudioRecorder: new (o: unknown) => {
        prepareToRecordAsync: () => Promise<void>;
        record: () => void;
        stop: () => Promise<void>;
        uri: string | null;
      };
    }).AudioRecorder;
    const recorder = new RecorderCtor(audio.RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    const started = Date.now();
    return {
      stopAndRead: async () => {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('Geen opname-URI');
        const res = await fetch(uri);
        const blob = await res.blob();
        return { blob, mime: blob.type || 'audio/m4a', durationMs: Date.now() - started, byteSize: blob.size };
      },
    };
  } catch {
    return { error: 'Opname starten mislukt op dit apparaat (native module/toestemming).' };
  }
}

export async function uploadBlob(uploadUrl: string, blob: Blob, mime: string) {
  const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': mime }, body: blob });
  if (!res.ok) throw new Error('UPLOAD_FAILED');
  const json = (await res.json()) as { storageId: string };
  return json.storageId;
}
