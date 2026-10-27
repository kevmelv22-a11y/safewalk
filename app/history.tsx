import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Card, Button } from '../src/components/ui';

const statusNl: Record<string, string> = { active: 'Onderweg', alert: 'Waarschuwing', ended: 'Beëindigd', expired: 'Verlopen' };
export default function History() {
  const h = useQuery(api.sessions.history);
  return (
    <Screen>
      <H1>Geschiedenis</H1>
      <P muted>Alleen bestemming en tijden – locatiepunten worden na 24 uur verwijderd. Je ziet de afgelopen {h?.days ?? 7} dagen.</P>
      {h?.sessions.length === 0 && <P muted>Nog geen reizen.</P>}
      {h?.sessions.map((s) => (
        <Card key={s.id}><P>{s.destination}</P>
          <P muted>{new Date(s.startedAt).toLocaleString('nl-NL')} · {statusNl[s.status]}{s.endedAt ? ` · tot ${new Date(s.endedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}</P></Card>
      ))}
      {h && !h.premium && <Button title="90 dagen geschiedenis met Premium" variant="secondary" onPress={() => router.push('/premium')} />}
    </Screen>
  );
}
