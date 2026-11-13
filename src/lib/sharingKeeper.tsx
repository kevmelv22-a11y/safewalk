import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Id } from '../../convex/_generated/dataModel';
import { useSessions } from './queries';
import { ensureSharing, sharingSessionId, stopSharing, subscribeSharing } from './location';

/** Reactief: voor welke reis deze telefoon nu echt locatie deelt (null = niet). */
export function useSharingSessionId(): Id<'sessions'> | null {
  const [id, setId] = useState<Id<'sessions'> | null>(sharingSessionId());
  useEffect(() => subscribeSharing(setId), []);
  return id;
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
  const local = useSharingSessionId();
  const [foregroundTick, setForegroundTick] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setForegroundTick((n) => n + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const action = keeperAction(serverActive, local);
    if (action === 'ensure' && serverActive) void ensureSharing(serverActive);
    else if (action === 'stop') void stopSharing();
  }, [serverActive, local, foregroundTick]);

  return null;
}
