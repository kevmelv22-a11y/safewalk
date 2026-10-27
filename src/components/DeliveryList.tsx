import { deliveryLabel } from '../lib/safety';
import { Card, P } from './ui';

export type Delivery = { recipientId: string; status: string; detail: string | null; name: string };
export function DeliveryList({ deliveries }: { deliveries: Delivery[] }) {
  return (
    <Card>
      <P>Status per contact</P>
      {deliveries.length === 0 && <P muted>Geen ontvangers gevonden. Voeg vertrouwde contacten toe.</P>}
      {deliveries.map((d) => (
        <P key={d.recipientId} muted>{d.status === 'sent' ? '✅' : d.status === 'queued' ? '⏳' : '❌'} {d.name}: {deliveryLabel[d.status]}{d.detail ? ` (${d.detail})` : ''}</P>
      ))}
    </Card>
  );
}
