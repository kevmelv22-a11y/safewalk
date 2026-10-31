import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/** Reactieve Convex-query: updates komen live binnen; de server geeft [] zonder geldige toegang. */
export const useLiveLocations = (sessionId: Id<'sessions'>) => useQuery(api.sessions.locations, { sessionId }) ?? [];

export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return now;
}
