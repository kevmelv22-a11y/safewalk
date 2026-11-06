import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

const extFor = (mime: string) => (/mp4|m4a|aac/.test(mime) ? 'm4a' : /webm/.test(mime) ? 'webm' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'bin');

/** Turns decrypted bytes into a playable URI plus an idempotent dispose(). */
export async function materializePlaintext(bytes: Uint8Array, mime: string): Promise<{ uri: string; dispose: () => void }> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mime || 'audio/webm' }));
    let done = false;
    return { uri: url, dispose: () => { if (!done) { done = true; URL.revokeObjectURL(url); } } };
  }
  const dir = playbackDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const f = new File(dir, `sw-play-${randomUUID()}.${extFor(mime)}`);
  f.create({ overwrite: true });
  await f.write(bytes);
  let done = false;
  return { uri: f.uri, dispose: () => { if (done) return; done = true; try { if (f.exists) f.delete(); } catch { /* best effort */ } } };
}

/** Delete the recorder's original plaintext file once the encrypted upload succeeded. */
export function deleteLocalOriginal(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* best effort */ }
}

/** App-specific scratch dir for decrypted playback; nothing else is ever written here. */
export const PLAYBACK_DIR_NAME = 'safewalk-playback';
function playbackDir() { return new Directory(Paths.cache, PLAYBACK_DIR_NAME); }

/**
 * Next-launch cleanup of plaintext temp files left by a killed app. Only deletes files named
 * `sw-play-*` inside the dedicated playback dir — never other cache content. Best effort.
 */
export function cleanupPlaybackLeftovers(): number {
  if (Platform.OS === 'web') return 0;
  let n = 0;
  try {
    const dir = playbackDir();
    if (!dir.exists) return 0;
    for (const e of dir.list()) {
      if (e instanceof File && /^sw-play-[\w-]+\.(m4a|webm|ogg|wav|bin)$/.test(e.name)) {
        try { e.delete(); n++; } catch { /* */ }
      }
    }
  } catch { /* */ }
  return n;
}
