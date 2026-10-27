import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { accuracyLabel, timeAgo } from '../../src/lib/safety';

export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['alert', id], refetchInterval: 10_000, queryFn: async () => {
    const { data } = await supabase.from('safety_alerts').select('*').eq('id', id).maybeSingle(); return data;
  } });
  const a = q.data;
  if (!a) return <Screen><P>{q.isFetched ? 'Melding niet gevonden of geen toegang.' : 'Laden…'}</P></Screen>;
  return (
    <Screen>
      <H1>{a.kind === 'sos' ? '🆘 SOS-melding' : '⚠️ Check-in gemist'}</H1>
      {a.status === 'cancelled' && <Notice kind="ok">De afzender heeft aangegeven dat alles goed is (vals alarm).</Notice>}
      <Card>
        <P>Gemeld: {new Date(a.created_at).toLocaleString('nl-NL')}</P>
        {a.lat != null ? <>
          <P muted>Laatst bekende locatie ({timeAgo(a.location_at)}) · {accuracyLabel(a.accuracy_m)}</P>
          <Button title="Open in kaarten" variant="secondary" onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lng}`)} />
        </> : <P muted>Geen locatie beschikbaar.</P>}
      </Card>
      {a.session_id && <Button title="Live kaart (indien nog gedeeld)" variant="secondary" onPress={() => router.push(`/watch/${a.session_id}`)} />}
      <Notice kind="warn">Probeer eerst zelf contact op te nemen. Bel bij direct gevaar 112 – SafeWalk doet dat niet automatisch.</Notice>
      <Button title="📞 Bel 112" variant="danger" onPress={() => Linking.openURL('tel:112')} />
    </Screen>
  );
}
