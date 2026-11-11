import type { AudioMode } from 'expo-audio';

/**
 * Eén gedeelde bron van waarheid voor de expo-audio audiomodus.
 *
 * expo-audio's setAudioModeAsync vervangt de héle modus: velden die je weglaat vallen
 * terug op de native standaard (Android: shouldPlayInBackground=false,
 * allowsBackgroundRecording=false). Als het opnamescherm dus alleen
 * `{ allowsRecording, allowsBackgroundRecording }` zette, werd het alarm bij naar-de-
 * achtergrond-gaan gepauzeerd. Daarom voegen alle aanroepen in de app hun wijziging hier
 * samen met de huidige modus, en blijven het alarm-vereisten altijd staan:
 * - shouldPlayInBackground: true (alarm klinkt door met scherm uit / app op achtergrond)
 * - interruptionMode: 'doNotMix' (alarm wordt niet zachter gezet door andere audio)
 */
export type AudioModePatch = Partial<Pick<AudioMode, 'allowsRecording' | 'allowsBackgroundRecording' | 'playsInSilentMode'>>;

export type SetAudioMode = (mode: Partial<AudioMode>) => Promise<void>;

export const ALARM_SAFE_AUDIO_DEFAULTS = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
  allowsBackgroundRecording: false,
} as const satisfies Partial<AudioMode>;

export function createAudioModeController(getSetter: () => Promise<SetAudioMode>) {
  let current: Partial<AudioMode> = { ...ALARM_SAFE_AUDIO_DEFAULTS };
  return {
    /** Voeg wijziging samen met de huidige modus en pas de volledige modus toe. */
    async apply(patch: AudioModePatch = {}): Promise<Partial<AudioMode>> {
      const next: Partial<AudioMode> = {
        ...current,
        ...patch,
        // Nooit overschrijfbaar: alarm moet op de achtergrond blijven spelen.
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      };
      current = next;
      const set = await getSetter();
      await set({ ...next });
      return { ...next };
    },
    current(): Partial<AudioMode> {
      return { ...current };
    },
    reset() {
      current = { ...ALARM_SAFE_AUDIO_DEFAULTS };
    },
  };
}

const controller = createAudioModeController(async () => (await import('expo-audio')).setAudioModeAsync);

/** Gebruik dit in plaats van expo-audio's setAudioModeAsync, overal in de app. */
export function applyAudioMode(patch?: AudioModePatch) {
  return controller.apply(patch);
}
