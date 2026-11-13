import { AppState, Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { applyAudioMode } from './audioMode';
import { FAKE_CALL_CHANNEL, FAKE_CALL_NOTIFICATION_ID, FAKE_CALL_SOUND, fakeCallNotification, VOICE_LINES, VOICE_PAUSE_MS } from './fakeCall';

/**
 * Native kant van de nep-oproep: beltoon, trillen, inplannen en de telefoonstem.
 *
 * Eerlijke beperking (Android): SafeWalk vraagt GEEN volledig-scherm-toestemming (Google beperkt die tot bel- en
 * wekker-apps). Staat de app dicht of is het scherm vergrendeld, dan komt er een melding met beltoon; tik erop om
 * het belscherm te openen. Is de app open, dan verschijnt het belscherm meteen.
 */

type Ringer = { stop: () => void };

export async function startRinging(): Promise<Ringer> {
  Vibration.vibrate([0, 900, 700], true);
  if (Platform.OS === 'web') {
    return startWebRing(() => Vibration.cancel());
  }
  try {
    const { createAudioPlayer } = await import('expo-audio');
    await applyAudioMode({ playsInSilentMode: true });
    const player = createAudioPlayer(require('../../assets/sounds/fake_ringtone.wav'));
    player.loop = true;
    player.volume = 1;
    player.play();
    return { stop: () => { try { player.pause(); player.remove(); } catch { /* */ } Vibration.cancel(); } };
  } catch {
    return { stop: () => Vibration.cancel() };
  }
}

function startWebRing(onStop: () => void): Ringer {
  const W = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: typeof AudioContext }) : null;
  if (!W?.AudioContext) return { stop: onStop };
  const ctx = new W.AudioContext();
  let stopped = false;
  const notes = [659.25, 783.99, 987.77, 783.99];
  const ring = () => {
    if (stopped) return;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.16); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.15);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.16);
    });
    setTimeout(ring, 2_500);
  };
  ring();
  return { stop: () => { stopped = true; void ctx.close().catch(() => undefined); onStop(); } };
}

/** Telefoonstem (Premium): leest de zinnen voor met pauzes. Gebruikt de Nederlandse stem van het toestel. */
export function startVoice(): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  void (async () => {
    const Speech = await import('expo-speech').catch(() => null);
    if (!Speech) return;
    const say = (i: number) => {
      if (stopped || i >= VOICE_LINES.length) return;
      Speech.speak(VOICE_LINES[i], { language: 'nl-NL', onDone: () => { if (!stopped) timer = setTimeout(() => say(i + 1), VOICE_PAUSE_MS); } });
    };
    timer = setTimeout(() => say(0), 1_200);
  })();
  return {
    stop: () => {
      stopped = true; if (timer) clearTimeout(timer);
      void import('expo-speech').then((S) => S.stop()).catch(() => undefined);
    },
  };
}

let inAppTimer: ReturnType<typeof setTimeout> | null = null;
let lastRingOpenedAt = 0;

/**
 * Open het belscherm hooguit één keer per oproep: de in-app-timer en de melding kunnen allebei afgaan.
 * Geeft false als er net (binnen 15 s) al een belscherm is geopend.
 */
export function openRingOnce(open: () => void, now = Date.now()): boolean {
  if (now - lastRingOpenedAt < 15_000) return false;
  lastRingOpenedAt = now;
  open();
  return true;
}

/**
 * Plant een nep-oproep in. Als de app open blijft, opent het belscherm zelf (onDueInApp).
 * Daarnaast een lokale melding met beltoon voor als de app op de achtergrond staat of het scherm uit is.
 */
export async function scheduleFakeCall(opts: { caller: string; voice: boolean; delayMin: number; onDueInApp: () => void }): Promise<{ at: number; notification: boolean }> {
  await cancelFakeCall();
  const at = Date.now() + opts.delayMin * 60_000;
  inAppTimer = setTimeout(() => {
    inAppTimer = null;
    // Alleen als de app nu echt voorop staat en de timer niet (door slapen op de achtergrond) veel te laat is.
    if (AppState.currentState !== 'active' || Date.now() - at > 30_000) return;
    void Notifications.cancelScheduledNotificationAsync(FAKE_CALL_NOTIFICATION_ID).catch(() => undefined);
    openRingOnce(opts.onDueInApp);
  }, opts.delayMin * 60_000);
  let notification = false;
  if (Platform.OS !== 'web') {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(FAKE_CALL_CHANNEL, {
          name: 'Nep-oproep', importance: Notifications.AndroidImportance.MAX, sound: FAKE_CALL_SOUND,
          vibrationPattern: [0, 900, 700, 900, 700, 900], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }
      const perm = await Notifications.getPermissionsAsync();
      const granted = perm.status === 'granted' || (await Notifications.requestPermissionsAsync()).status === 'granted';
      if (granted) {
        await Notifications.scheduleNotificationAsync({
          identifier: FAKE_CALL_NOTIFICATION_ID,
          content: { ...fakeCallNotification(opts.caller, opts.voice), priority: Notifications.AndroidNotificationPriority.MAX },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: opts.delayMin * 60, channelId: FAKE_CALL_CHANNEL },
        });
        notification = true;
      }
    } catch { notification = false; }
  }
  return { at, notification };
}

export async function cancelFakeCall() {
  if (inAppTimer) { clearTimeout(inAppTimer); inAppTimer = null; }
  if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(FAKE_CALL_NOTIFICATION_ID).catch(() => undefined);
}
