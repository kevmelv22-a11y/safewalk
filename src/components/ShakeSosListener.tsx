import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useProfile, useSessions } from '../lib/queries';
import { feedShake, getShakeOptIn, newShakeState, SHAKE_INTERVAL_MS, subscribeShakeOptIn } from '../lib/shake';
import { feedFall, getFallOptIn, newFallState, subscribeFallOptIn } from '../lib/fallDetect';

/**
 * Schudden voor SOS (opt-in). Alleen als: aangezet, 16+, app op de voorgrond, niet al in SOS/gevaar/nep-oproep.
 * Opent het SOS-scherm met 5 s aftellen om te annuleren; verstuurt zelf niets.
 */
export function ShakeSosListener() {
  const [on, setOn] = useState(false);
  const [fallOn, setFallOn] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const profile = useProfile();
  const sessions = useSessions();
  const path = usePathname();
  const pathRef = useRef(path);
  const sessionRef = useRef<string | null>(null);
  const sid = sessions?.mine?._id ?? null;
  useEffect(() => { pathRef.current = path; sessionRef.current = sid; }, [path, sid]);

  useEffect(() => { void getShakeOptIn().then(setOn); return subscribeShakeOptIn(setOn); }, []);
  useEffect(() => { void getFallOptIn().then(setFallOn); return subscribeFallOptIn(setFallOn); }, []);
  useEffect(() => { const s = AppState.addEventListener('change', (x) => setActive(x === 'active')); return () => s.remove(); }, []);

  const enabled = (on || fallOn) && active && profile?.ageStatus === 'adult' && Platform.OS !== 'web';
  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    const st = newShakeState();
    const fall = newFallState();
    const go = (trigger: 'shake' | 'fall') => {
      const p = pathRef.current ?? '';
      if (/^\/(sos|danger|fake-call)/.test(p)) return;
      const sid = sessionRef.current;
      router.push({ pathname: '/sos', params: { trigger, ...(sid ? { sessionId: sid } : {}) } });
    };
    (async () => {
      try {
        const { Accelerometer } = await import('expo-sensors');
        if (cancelled || !(await Accelerometer.isAvailableAsync())) return;
        Accelerometer.setUpdateInterval(SHAKE_INTERVAL_MS);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const now = Date.now();
          if (on && feedShake(st, x, y, z, now)) go('shake');
          else if (fallOn && feedFall(fall, x, y, z, now)) go('fall');
        });
      } catch { /* geen sensor (oude build/web): stil niets doen */ }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled, on, fallOn]);
  return null;
}
