import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
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
import { ARRIVAL_PROMPT_M, arrivalDistance, shouldAskArrived } from '../../src/lib/arrival';
import { recordSafeArrival } from '../../src/lib/reviewPrompt';
import { tripLinkMessage } from '../../src/lib/composer';
import { ContactComposer } from '../../src/components/ContactComposer';

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
  const [snoozedAt, setSnoozedAt] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkText, setLinkText] = useState<string | null>(null);
  const createTripLink = useMutation(api.tracking.createTripLink);
  const revokeLink = useMutation(api.tracking.revokeShareLink);
  const allLinks = useQuery(api.tracking.myShareLinks);
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
      else {
        await stopSharing(); await cancelReminders();
        // 3e schone veilige aankomst → eenmalig vragen om een beoordeling in de winkel.
        void recordSafeArrival({ clean: s.status !== 'alert' }).catch(() => undefined);
      }
    } catch (e) { setErr(errorNl(e)); }
  };
  const dest = s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng } : null;
  const last = trail.at(-1) ?? null;
  const askArrived = !!ci && ci.status !== 'confirmed' && ci.status !== 'cancelled'
    && shouldAskArrived({ last, dest, now, snoozedAt, active: data.isOwner && !ended && sharingId === id });
  const distance = arrivalDistance(last, dest);
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
  const tripLinks = (allLinks ?? []).filter((l) => l.sessionId === id && !l.expired);
  const shareTripLink = async () => {
    setLinkBusy(true); setLinkMsg(null); setErr(null);
    try {
      // Expliciete keuze van de gebruiker (deze knop); locatie wordt al gedeeld met toestemming.
      const r = await createTripLink({ sessionId: id, locationConsent: true });
      const text = tripLinkMessage(`${site}${r.path}`);
      setLinkText(text);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setLinkMsg('Link gekopieerd. Plak hem in sms of WhatsApp; jij tikt zelf op versturen.');
      } else {
        await Share.share({ message: text });
        setLinkMsg('Deelvenster geopend. Er is pas iets verstuurd als jij in die app op Versturen tikt.');
      }
    } catch (e) { setErr(errorNl(e)); }
    finally { setLinkBusy(false); }
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
      {askArrived && (
        <Card style={{ borderColor: '#22C55E', borderWidth: 2 }}>
          <P style={{ fontSize: 22, fontWeight: '800' }}>Ben je er?</P>
          <P muted>Je bent op ongeveer {Math.max(5, Math.round((distance ?? ARRIVAL_PROMPT_M) / 5) * 5)} m van {s.destinationLabel}. Bevestig dat je veilig bent aangekomen, dan stopt het delen.</P>
          <Button title="✓ Ja, ik ben veilig aangekomen" variant="success" onPress={() => respond(0)} />
          <Button title="Nog niet" variant="secondary" onPress={() => setSnoozedAt(Date.now())} />
        </Card>
      )}
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
      {data.isOwner && !ended && (
        <Card>
          <P>Meekijklink voor iemand zonder app</P>
          <P muted style={{ fontSize: 14 }}>Wie de link heeft, ziet in de browser je bestemming, de aftelling tot je verwachte aankomst en of je veilig bent aangekomen of een check-in mist. Je locatie is alleen zichtbaar zolang deze reis loopt. De link verloopt vanzelf en je kunt hem hier intrekken.</P>
          <Button title="Meekijklink delen" onPress={shareTripLink} loading={linkBusy} />
          {linkMsg && <Notice kind="ok">{linkMsg}</Notice>}
          {linkText && <ContactComposer message={linkText} />}
          {tripLinks.map((l) => (
            <Button key={l.id} title={`Intrekken: link tot ${new Date(l.expiresAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`} variant="secondary"
              onPress={() => revokeLink({ id: l.id }).catch((e) => setErr(errorNl(e)))} />
          ))}
        </Card>
      )}
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
