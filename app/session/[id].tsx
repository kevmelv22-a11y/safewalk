import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, Button, Card, P, Notice, H1 } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { SosButton } from '../../src/components/SosButton';
import { errorNl } from '../../src/lib/convex';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { checkInPhase, deliveryIcon, deliveryLabel, formatCountdown, notificationKindLabel, sharingStatus, timeAgo } from '../../src/lib/safety';
import { signalText } from '../../convex/motionText';
import { startSharing, stopSharing } from '../../src/lib/location';
import { useSharingSessionId } from '../../src/lib/sharingKeeper';
import { cancelReminders, scheduleCheckInReminder } from '../../src/lib/notifications';

export default function MySession() {
  const id = useLocalSearchParams<{ id: string }>().id as Id<'sessions'>; const now = useNow(1000);
  const trail = useLiveLocations(id);
  const data = useQuery(api.sessions.get, { sessionId: id });
  const respondCheckIn = useMutation(api.sessions.respondCheckIn);
  const endSession = useMutation(api.sessions.end);
  const revokeViewer = useMutation(api.sessions.revokeViewer);
  const acknowledge = useMutation(api.motion.acknowledge);
  const [err, setErr] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const sharingId = useSharingSessionId();
  const s = data?.session; const ci = data?.checkIn;
  const ended = !!s && s.endedAt !== undefined;
  useEffect(() => { if (ended) stopSharing(); }, [ended]);
  if (data === null) return (
    <Screen>
      <Notice kind="info">Deze reis bestaat niet meer of je hebt er geen toegang toe.</Notice>
      <Button title="Terug naar dashboard" variant="secondary" onPress={() => router.replace('/dashboard')} />
    </Screen>
  );
  if (!s) return <Screen><P muted>Reis laden…</P></Screen>;
  const share = data.isOwner && !ended ? sharingStatus(sharingId === id, trail.at(-1)?.recordedAt ?? null, now) : null;
  const phase = ci && ci.status !== 'confirmed' && ci.status !== 'cancelled' ? checkInPhase(ci.dueAt, ci.graceMinutes, now) : null;
  const respond = async (extend: number) => {
    try {
      const due = await respondCheckIn({ sessionId: id, extendMinutes: extend });
      if (due) await scheduleCheckInReminder(new Date(due)).catch(() => {});
      else { await stopSharing(); await cancelReminders(); }
    } catch (e) { setErr(errorNl(e)); }
  };
  const stop = async () => {
    setStopping(true); setErr(null);
    try { await endSession({ sessionId: id }); }
    catch (e) {
      // Niet lokaal stoppen: de reis loopt op de server nog door (check-in kan je contacten waarschuwen).
      setErr(`Reis beëindigen lukte niet: ${errorNl(e)} Je reis en het delen lopen nog. Probeer het opnieuw als je verbinding hebt.`);
      setStopping(false);
      return;
    }
    await stopSharing(); await cancelReminders(); router.replace('/dashboard');
  };
  const resume = async () => {
    setResuming(true); setErr(null);
    try { await startSharing(id); }
    catch (e) { setErr(String((e as Error).message) + ' Geef toestemming in de instellingen van je telefoon.'); }
    finally { setResuming(false); }
  };
  return (
    <Screen>
      <H1>{s.destinationLabel}</H1>
      {ended && <Notice kind="info">Deze reis is beëindigd. Locatie wordt niet meer gedeeld.</Notice>}
      {share && (
        <Notice kind={share.kind}>{share.text}{share.lastAt ? ` Laatste punt: ${timeAgo(share.lastAt, now)}.` : ''}</Notice>
      )}
      {share && !share.live && (
        <Button title="Locatie delen hervatten" variant="success" loading={resuming} onPress={resume} />
      )}
      {s.status === 'alert' && !ended && <Notice kind="danger">Je check-in is gemist. Je contacten zijn gewaarschuwd. Bevestig hieronder als alles goed is.</Notice>}
      {!ended && data.signals.map((sg) => (
        <Card key={sg._id} style={{ borderColor: '#F59E0B', borderWidth: 2 }}>
          <P>{signalText[sg.kind]}</P>
          <P muted>Dit is alleen een extra vraag; je contacten worden hierdoor niet gewaarschuwd.</P>
          <Button title="✓ Alles goed" variant="success" onPress={() => acknowledge({ signalId: sg._id })} />
        </Card>
      ))}
      {!ended && ci && phase && (
        <Card style={phase !== 'running' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
          {phase === 'running' ? <P>Check-in over {formatCountdown(ci.dueAt - now)}</P> : <P style={{ fontSize: 22, fontWeight: '800' }}>Alles goed?</P>}
          {phase === 'grace' && <P muted>Bevestig binnen {formatCountdown(ci.dueAt + ci.graceMinutes * 60_000 - now)}, anders worden je contacten gewaarschuwd.</P>}
          <Button title="✓ Ik ben veilig aangekomen" variant="success" onPress={() => respond(0)} />
          <Button title="+10 minuten" variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(10)} />
          <Button title="+20 minuten" variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(20)} />
        </Card>
      )}
      <LiveMap trail={trail} dest={s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng, label: s.destinationLabel } : null} now={now} />
      <Card>
        <P>Meekijkers</P>
        {data.viewers.map((v) => <P key={v.viewerId} muted>{v.revoked ? '⛔' : '👀'} {v.name}{v.revoked ? ' (toegang ingetrokken)' : ''}</P>)}
        {!ended && data.viewers.filter((v) => !v.revoked).map((v) => (
          <Button key={'r' + v.viewerId} title={`Toegang intrekken: ${v.name}`} variant="secondary" onPress={() => revokeViewer({ sessionId: id, viewerId: v.viewerId }).catch((e) => setErr(errorNl(e)))} />
        ))}
      </Card>
      {data.notifications.length > 0 && (
        <Card>
          <P>Meldingen aan je contacten</P>
          {data.notifications.map((n) => <P key={n.id} muted>{deliveryIcon(n.status)} {notificationKindLabel[n.kind]} → {n.name}: {deliveryLabel[n.status]}</P>)}
        </Card>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      {!ended && <SosButton sessionId={id} />}
      {!ended && <Button title="Stop delen en beëindig reis" variant="danger" loading={stopping} onPress={stop} />}
    </Screen>
  );
}
