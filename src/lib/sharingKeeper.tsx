import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Id } from '../../convex/_generated/dataModel';
import { useSessions } from './queries';
import { ensureSharing, sharingMode, sharingSessionId, stopOrphanedBackground, stopSharing, subscribeSharing, untilFor, updateSharingUntil, type SharingMode } from './location';

/** Reactief: voor welke reis deze telefoon nu echt locatie deelt (null = niet). */
export function useSharingSessionId(): Id<'sessions'> | null {
  const [id, setId] = useState<Id<'sessions'> | null>(sharingSessionId());
  useEffect(() => subscribeSharing(setId), []);
  return id;
}

/** Reactief: deelt deze telefoon op de achtergrond ('background'), alleen met app open ('foreground'), of niet (null)? */
export function useSharingMode(): SharingMode {
  const [m, setM] = useState<SharingMode>(sharingMode());
  useEffect(() => subscribeSharing(() => setM(sharingMode())), []);
  return m;
}

/** Pure beslissing (testbaar): wat moet de keeper doen met de serverstatus en de lokale watcher? */
export function keeperAction(
  serverActive: Id<'sessions'> | null | undefined,
  local: Id<'sessions'> | null,
): 'wait' | 'ensure' | 'stop' | 'none' {
  if (serverActive === undefined) return 'wait'; // query laadt nog of verbinding herstelt
  if (serverActive === null) return local ? 'stop' : 'none';
  return local === serverActive ? 'none' : 'ensure';
}

/**
 * Houdt het delen in lijn met de server: na een herstart van de app (of terug naar de voorgrond)
 * hervat het delen voor een nog lopende reis, maar alleen als locatietoestemming al gegeven is.
 * Is de reis elders beëindigd, dan stopt het delen hier ook.
 */
export function SharingKeeper() {
  const sessions = useSessions();
  const serverActive = sessions === undefined ? undefined : (sessions.mine?._id ?? null);
  const expiresAt = sessions?.mine?.expiresAt;
  const local = useSharingSessionId();
  const [foregroundTick, setForegroundTick] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setForegroundTick((n) => n + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const action = keeperAction(serverActive, local);
    if (action === 'ensure' && serverActive) void ensureSharing(serverActive, expiresAt ? untilFor(expiresAt) : undefined);
    else if (action === 'stop') void stopSharing();
    // Geen open reis op de server: een achtergebleven achtergrondtaak (na herstart) direct stoppen.
    if (serverActive === null) void stopOrphanedBackground();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expiresAt apart hieronder; hier alleen op reis/watcher/voorgrond reageren
  }, [serverActive, local, foregroundTick]);

  // Verlengd (check-in +10/+20): eigen stopgrens van de achtergrondtaak meeschuiven.
  useEffect(() => {
    if (serverActive && local === serverActive && expiresAt) void updateSharingUntil(serverActive, untilFor(expiresAt));
  }, [serverActive, local, expiresAt]);

  return null;
}
