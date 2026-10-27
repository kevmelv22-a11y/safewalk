import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useApp } from '../store/app';

export const useUserId = () => useApp((s) => s.session?.user.id ?? null);

export type Contact = { id: string; owner_id: string; contact_id: string; status: string; name: string; direction: 'mine' | 'theirs' };
export function useContacts() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['contacts', uid], enabled: !!uid,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase.from('trusted_contacts').select('*').eq('status', 'accepted');
      if (error) throw error;
      const ids = [...new Set(data.flatMap((c) => [c.owner_id, c.contact_id]))];
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      const name = (id: string) => profs?.find((p) => p.id === id)?.display_name || 'Onbekend';
      return data.map((c) => c.owner_id === uid
        ? { ...c, name: name(c.contact_id), direction: 'mine' as const }
        : { ...c, name: name(c.owner_id), direction: 'theirs' as const });
    },
  });
}
export function useProfile() {
  const uid = useUserId();
  return useQuery({ queryKey: ['profile', uid], enabled: !!uid, queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single(); if (error) throw error; return data;
  } });
}
export function useMySubscription() {
  const uid = useUserId();
  return useQuery({ queryKey: ['sub', uid], enabled: !!uid, queryFn: async () => {
    const { data } = await supabase.from('subscriptions').select('*').eq('user_id', uid!).maybeSingle(); return data;
  } });
}
/** Actieve eigen sessie + sessies waar ik voor ben uitgenodigd (RLS filtert). */
export function useSessions() {
  const uid = useUserId();
  return useQuery({ queryKey: ['sessions', uid], enabled: !!uid, refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.from('safety_sessions').select('*').in('status', ['active', 'alert']).order('started_at', { ascending: false });
    if (error) throw error;
    return { mine: data.find((s) => s.user_id === uid) ?? null, watching: data.filter((s) => s.user_id !== uid) };
  } });
}
