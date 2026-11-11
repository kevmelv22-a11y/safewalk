import { Platform } from 'react-native';
import { alarmService } from './alarmService';

type Player = { stop: () => Promise<void> };

/**
 * Speelt een luid, herhalend alarm. Op native: expo-audio. Op web: Web Audio oscillator.
 * Alarm stopt alleen via stop() — bedoeld tot PIN-unlock.
 */
export async function startAlarm(): Promise<Player> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let stopped = false;
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    const tick = () => {
      if (stopped) return;
      osc?.stop();
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = 0.25;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { if (!stopped && osc) osc.frequency.value = 1100; }, 280);
      setTimeout(() => { if (!stopped) { osc?.stop(); tick(); } }, 560);
    };
    tick();
    return { stop: async () => { stopped = true; try { osc?.stop(); await ctx.close(); } catch { /* */ } } };
  }
  try {
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
    const player = createAudioPlayer(require('../../assets/sounds/alarm.wav'));
    player.loop = true;
    player.volume = 1;
    player.play();
    // Android: echte voorgronddienst (mediaPlayback) + vaste melding zolang dit alarm klinkt.
    const release = alarmService.acquire();
    return {
      stop: async () => {
        try { player.pause(); player.remove(); } catch { /* */ }
        release();
      },
    };
  } catch {
    return { stop: async () => {} };
  }
}
