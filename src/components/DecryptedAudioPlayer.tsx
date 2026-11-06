import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, Notice, P } from './ui';
import { materializePlaintext } from '../lib/playbackFile';

/**
 * Plays decrypted bytes. Web: Blob object URL, revoked on unmount/close.
 * Native: plaintext temp file in the cache dir, deleted on unmount/close (see playbackFile.ts).
 */
export function DecryptedAudioPlayer({ bytes, mime, onClose }: { bytes: Uint8Array; mime: string; onClose: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cleanup: (() => void) | null = null; let alive = true;
    materializePlaintext(bytes, mime).then((m) => {
      if (!alive) { m.dispose(); return; }
      cleanup = m.dispose; setUri(m.uri);
    }).catch(() => setErr('Afspelen voorbereiden mislukt.'));
    return () => { alive = false; cleanup?.(); };
  }, [bytes, mime]);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  if (err) return <Notice kind="danger">{err}</Notice>;
  if (!uri) return <P muted>Voorbereiden…</P>;
  return (
    <>
      <P muted>{Platform.OS === 'web' ? 'Lokaal ontsleuteld (alleen in dit tabblad).' : 'Lokaal ontsleuteld; tijdelijk bestand wordt gewist bij sluiten.'}{' '}
        {Math.round(status.currentTime)}s / {Math.round(status.duration || 0)}s</P>
      <Button title={status.playing ? 'Pauze' : 'Afspelen'} onPress={() => (status.playing ? player.pause() : player.play())} />
      <Button title="Sluiten" variant="secondary" onPress={() => { player.pause(); onClose(); }} />
    </>
  );
}
