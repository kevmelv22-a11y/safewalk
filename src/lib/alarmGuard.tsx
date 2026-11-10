import React, { useEffect, useRef } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { startAlarm } from './dangerAlarm';

/**
 * Houdt het alarm aan zolang de server een actief incident heeft.
 * Navigatie weg van /danger stopt het alarm dus niet stilletjes.
 *
 * Beperking (eerlijk): OS kan de app killen, power-off, of stille modus forceren —
 * "kan niet zonder PIN stoppen" is géén absolute OS-garantie.
 */
export function AlarmGuard() {
  const active = useQuery(api.incidents.active);
  const player = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (active?._id) {
        if (!player.current) player.current = await startAlarm();
      } else if (player.current) {
        await player.current.stop();
        player.current = null;
      }
      if (cancelled && player.current) { await player.current.stop(); player.current = null; }
    })();
    return () => { cancelled = true; };
  }, [active?._id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      // Documenteer: op background kan OS audio dempen; we claimen geen lockscreen-persistentie
      if (st !== 'active' && Platform.OS === 'web') { /* web: tab mute mogelijk */ }
    });
    return () => sub.remove();
  }, []);

  if (!active) return null;
  return (
    <View accessibilityLiveRegion="assertive" style={{ backgroundColor: '#7f1d1d', padding: 8 }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 13 }}>
        Alarm actief — stop alleen met veiligheidscode (OS kan app alsnog beëindigen)
      </Text>
    </View>
  );
}
