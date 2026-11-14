import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { formatCountdown } from '../../src/lib/safety';
import { COPY as DialCopy, onPressOpen112 } from '../../src/lib/dial112';

export default function Watch() {
  const id = useLocalSearchParams<{ id: string }>().id as Id<'sessions'>; const now = useNow(1000);
  const trail = useLiveLocations(id);
  const data = useQuery(api.sessions.get, { sessionId: id });
  // Server geeft null na intrekken/einde/verlopen/blokkeren — reactief, dus direct
  if (data === null) return <Screen><H1>Geen toegang</H1><P muted>Deze reis is beëindigd, verlopen of je toegang is ingetrokken.</P><Button title="Naar het startscherm" variant="secondary" onPress={() => router.replace('/dashboard')} /></Screen>;
  if (!data) return <Screen><P muted>Reis laden…</P></Screen>;
  const s = data.session;
  return (
    <Screen>
      <H1>{data.ownerName} {s.kind === 'timer' ? `⏱️ ${s.destinationLabel}` : `→ ${s.destinationLabel}`}</H1>
      {s.sosAt !== undefined && <Notice kind="danger">🆘 {data.ownerName} heeft SOS geactiveerd om {new Date(s.sosAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}. Bel bij direct gevaar zelf 112.</Notice>}
      {s.status === 'alert' && <Notice kind="danger">{data.ownerName} heeft niet op tijd ingecheckt. Probeer contact op te nemen. Bel bij direct gevaar zelf 112.</Notice>}
      {data.privacy?.mode && !data.privacy.revealed && <Notice kind="info">🔒 Privacy-check-in: je ziet alleen de status. Locatie, batterij en route worden pas zichtbaar bij een gemiste check-in of SOS.</Notice>}
      {s.lowBatteryAt !== undefined && <Notice kind="warn">🔋 Batterij bijna leeg{typeof s.batteryPct === 'number' ? ` (${s.batteryPct}%)` : ''}. Valt de telefoon uit, dan stopt de live locatie.</Notice>}
      {s.notLiveAt !== undefined && <Notice kind="warn">📡 Niet meer live{s.lastSeenAt ? ` sinds ${new Date(s.lastSeenAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}. Geen bereik, lege batterij of telefoon uit? Neem bij twijfel contact op.</Notice>}
      <Card><P>{s.kind === 'timer' ? 'Timer loopt af' : 'Verwachte aankomst'} {new Date(s.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>
        <P muted>{s.expectedArrival > now ? `nog ${formatCountdown(s.expectedArrival - now)}` : 'Verwachte tijd verstreken'}</P></Card>
      <LiveMap trail={trail} dest={s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng, label: s.destinationLabel } : null} now={now} />
      <Button title={DialCopy.title} variant="danger" hint={DialCopy.hint} onPress={() => { void onPressOpen112(); }} />
    </Screen>
  );
}
