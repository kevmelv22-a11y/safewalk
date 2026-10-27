import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Loc } from '../components/LiveMap';

/** Laadt locaties van een sessie en abonneert op Realtime INSERTs (RLS bepaalt wat zichtbaar is). */
export function useLiveLocations(sessionId: string) {
  const [trail, setTrail] = useState<Loc[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('location_updates').select('lat,lng,accuracy_m,recorded_at').eq('session_id', sessionId)
      .order('recorded_at', { ascending: true }).limit(500)
      .then(({ data, error }) => { if (!alive) return; if (error) setError(error.message); else setTrail(data ?? []); });
    const ch = supabase.channel(`loc:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_updates', filter: `session_id=eq.${sessionId}` },
        (p) => setTrail((t) => [...t, p.new as Loc].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).slice(-500)))
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [sessionId]);
  return { trail, error };
}

export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return now;
}
