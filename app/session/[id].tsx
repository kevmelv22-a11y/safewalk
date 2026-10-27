import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen, Button, Card, P, Notice, H1 } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { SosButton } from '../../src/components/SosButton';
import { supabase } from '../../src/lib/supabase';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { checkInPhase, formatCountdown, mapErrorNl } from '../../src/lib/safety';
import { stopSharing } from '../../src/lib/location';
import { cancelReminders, scheduleCheckInReminder } from '../../src/lib/notifications';

export default function MySession() {
  const { id } = useLocalSearchParams<{ id: string }>(); const qc = useQueryClient(); const now = useNow(1000);
  const { trail } = useLiveLocations(id);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['session', id], refetchInterval: 15_000, queryFn: async () => {
    const [s, c, v] = await Promise.all([
      supabase.from('safety_sessions').select('*').eq('id', id).single(),
      supabase.from('check_ins').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('session_viewers').select('viewer_id, revoked_at').eq('session_id', id),
    ]);
    if (s.error) throw s.error;
    const ids = (v.data ?? []).map((x) => x.viewer_id);
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids);
    return { session: s.data, checkIn: c.data, viewers: (v.data ?? []).map((x) => ({ ...x, name: profs?.find((p) => p.id === x.viewer_id)?.display_name ?? 'Contact' })) };
  } });
  const s = q.data?.session; const ci = q.data?.checkIn;
  const ended = s && s.ended_at;
  useEffect(() => { if (ended) stopSharing(); }, [ended]);
  if (!s) return <Screen><P>Laden…</P></Screen>;
  const phase = ci && ci.status !== 'confirmed' ? checkInPhase(ci.due_at, ci.grace_minutes, now) : null;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['session', id] }); qc.invalidateQueries({ queryKey: ['sessions'] }); };
  const respond = async (extend: number) => {
    const { data, error } = await supabase.rpc('respond_check_in', { p_session: id, p_extend_minutes: extend });
    if (error) return setErr(mapErrorNl(error.message));
    if (extend) await scheduleCheckInReminder(new Date(data as string)).catch(() => {});
    else { await stopSharing(); await cancelReminders(); }
    refresh();
  };
  const stop = async () => {
    const { error } = await supabase.rpc('end_session', { p_session: id });
    await stopSharing(); await cancelReminders();
    if (error) setErr(mapErrorNl(error.message)); refresh(); router.replace('/dashboard');
  };
  return (
    <Screen>
      <H1>{s.destination_label}</H1>
      {ended ? <Notice kind="info">Deze reis is beëindigd. Locatie wordt niet meer gedeeld.</Notice> : null}
      {s.status === 'alert' && <Notice kind="danger">Je check-in is gemist. Je contacten zijn gewaarschuwd. Bevestig hieronder als alles goed is.</Notice>}
      {!ended && ci && (
        <Card style={phase === 'grace' || phase === 'overdue' || phase === 'due' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
          {phase === 'running' ? <P>Check-in over {formatCountdown(new Date(ci.due_at).getTime() - now)}</P>
            : <P style={{ fontSize: 22, fontWeight: '800' }}>Alles goed?</P>}
          {phase === 'grace' && <P muted>Bevestig binnen {formatCountdown(new Date(ci.due_at).getTime() + ci.grace_minutes * 60_000 - now)}, anders worden je contacten gewaarschuwd.</P>}
          <Button title="✓ Ik ben veilig aangekomen" variant="success" onPress={() => respond(0)} />
          <Button title="+10 minuten" variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(10)} />
          <Button title="+20 minuten" variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(20)} />
        </Card>
      )}
      <LiveMap trail={trail} dest={s.destination_lat != null ? { lat: s.destination_lat, lng: s.destination_lng, label: s.destination_label } : null} now={now} />
      <Card>
        <P>Meekijkers</P>
        {q.data?.viewers.map((v) => (
          <P key={v.viewer_id} muted>{v.revoked_at ? '⛔' : '👀'} {v.name}{v.revoked_at ? ' (toegang ingetrokken)' : ''}</P>
        ))}
        {!ended && q.data?.viewers.filter((v) => !v.revoked_at).map((v) => (
          <Button key={'r' + v.viewer_id} title={`Toegang intrekken: ${v.name}`} variant="secondary"
            onPress={async () => { await supabase.rpc('revoke_viewer', { p_session: id, p_viewer: v.viewer_id }); refresh(); }} />
        ))}
      </Card>
      {err && <Notice kind="danger">{err}</Notice>}
      {!ended && <SosButton sessionId={id} />}
      {!ended && <Button title="Stop delen en beëindig reis" variant="danger" onPress={stop} />}
    </Screen>
  );
}
