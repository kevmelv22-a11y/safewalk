import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { supabase } from '../../src/lib/supabase';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { formatCountdown } from '../../src/lib/safety';

export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>(); const now = useNow(1000);
  const { trail, error } = useLiveLocations(id);
  const q = useQuery({ queryKey: ['watch', id], refetchInterval: 15_000, queryFn: async () => {
    const { data } = await supabase.from('safety_sessions').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    const { data: p } = await supabase.from('profiles').select('display_name').eq('id', data.user_id).maybeSingle();
    return { ...data, name: p?.display_name ?? 'Je contact' };
  } });
  // RLS: na intrekken/einde/verlopen levert de server niets meer op
  if (q.isFetched && !q.data) return <Screen><H1>Geen toegang</H1><P muted>Deze reis is beëindigd, verlopen of je toegang is ingetrokken.</P></Screen>;
  const s = q.data; if (!s) return <Screen><P>Laden…</P></Screen>;
  return (
    <Screen>
      <H1>{s.name} → {s.destination_label}</H1>
      {s.status === 'alert' && <Notice kind="danger">{s.name} heeft niet op tijd ingecheckt. Probeer contact op te nemen. Bel bij direct gevaar zelf 112.</Notice>}
      <Card><P>Verwachte aankomst {new Date(s.expected_arrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>
        <P muted>{new Date(s.expected_arrival).getTime() > now ? `nog ${formatCountdown(new Date(s.expected_arrival).getTime() - now)}` : 'Verwachte tijd verstreken'}</P></Card>
      {error && <Notice kind="warn">Locatie laden mislukt: {error}</Notice>}
      <LiveMap trail={trail} dest={s.destination_lat != null ? { lat: s.destination_lat, lng: s.destination_lng, label: s.destination_label } : null} now={now} />
      <Button title="📞 Bel zelf 112" variant="danger" hint="Opent je telefoon-app; SafeWalk belt niet automatisch" onPress={() => Linking.openURL('tel:112')} />
    </Screen>
  );
}
