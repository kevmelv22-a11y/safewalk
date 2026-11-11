/**
 * Referentietelling voor de Android-alarmvoorgronddienst (type mediaPlayback).
 *
 * Er kunnen tegelijk meerdere alarmspelers actief zijn (AlarmGuard in de layout en het
 * gevaarscherm). De dienst + vaste melding "SafeWalk-alarm actief" moet blijven zolang
 * minstens één alarm klinkt, en verdwijnen zodra het laatste alarm stopt.
 */
export type AlarmServiceNative = {
  start: () => boolean;
  stop: () => boolean;
};

export function createAlarmServiceController(getNative: () => AlarmServiceNative | null) {
  let active = 0;

  /** Registreert een spelend alarm; geeft een idempotente release-functie terug. */
  function acquire(): () => void {
    active += 1;
    if (active === 1) {
      try { getNative()?.start(); } catch { /* alarmgeluid speelt ook zonder dienst */ }
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      if (active === 0) {
        try { getNative()?.stop(); } catch { /* ignore */ }
      }
    };
  }

  return { acquire, activeCount: () => active };
}

function loadNative(): AlarmServiceNative | null {
  // Alleen Android heeft de voorgronddienst; iOS/web gebruiken hun eigen achtergrond-audio.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('safewalk-native') as typeof import('safewalk-native');
    return { start: native.startAlarmForegroundService, stop: native.stopAlarmForegroundService };
  } catch {
    return null;
  }
}

export const alarmService = createAlarmServiceController(loadNative);
