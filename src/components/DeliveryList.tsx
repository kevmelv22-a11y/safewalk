import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { deliveryLabel } from '../lib/safety';
import { Card, P } from './ui';

export function DeliveryList({ alertId }: { alertId: string }) {
  const q = useQuery({ queryKey: ['deliveries', alertId], refetchInterval: 3000, queryFn: async () => {
    const { data } = await supabase.from('alert_deliveries').select('recipient_id,status,detail,updated_at').eq('alert_id', alertId);
    const { data: profs } = await supabase.from('profiles').select('id,display_name').in('id', (data ?? []).map((d) => d.recipient_id));
    return (data ?? []).map((d) => ({ ...d, name: profs?.find((p) => p.id === d.recipient_id)?.display_name ?? 'Contact' }));
  } });
  return (
    <Card>
      <P>Status per contact</P>
      {q.data?.length === 0 && <P muted>Geen ontvangers gevonden. Voeg vertrouwde contacten toe.</P>}
      {q.data?.map((d) => (
        <P key={d.recipient_id} muted>{d.status === 'sent' ? '✅' : d.status === 'queued' ? '⏳' : '❌'} {d.name}: {deliveryLabel[d.status]}{d.detail ? ` (${d.detail})` : ''}</P>
      ))}
    </Card>
  );
}
