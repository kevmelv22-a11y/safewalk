import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, Button, Card, P, Notice, Disclaimer, H1 } from '../src/components/ui';
import { ActionButtons } from '../src/components/ActionButtons';
import { PinPad } from '../src/components/PinPad';
import { useContacts, useSessions } from '../src/lib/queries';
import { formatCountdown } from '../src/lib/safety';
import { useNow } from '../src/lib/useLiveLocations';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { errorNl } from '../src/lib/convex';

function clientRef(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Dashboard() {
  const sessions = useSessions();
  const contacts = useContacts();
  const now = useNow(1000);
  const pinStatus = useQuery(api.security.pinStatus);
  const activeIncident = useQuery(api.incidents.active);
  const startUnsafe = useMutation(api.incidents.startUnsafe);
  const comeQuick = useMutation(api.incidents.comeQuick);
  const verifyPin = useMutation(api.security.verifyPin);
  const sendLiveNow = useMutation(api.incidents.sendLiveLocationNow);
  const mine = sessions?.mine;
  const watching = sessions?.watching ?? [];
  const myContacts = contacts?.mine ?? [];
  const [busy, setBusy] = useState<'unsafe' | 'come' | 'safe' | null>(null);
  const [safeOpen, setSafeOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeIncident?._id) router.replace({ pathname: '/danger', params: { incidentId: activeIncident._id } });
  }, [activeIncident?._id]);

  useEffect(() => {
    if (pinStatus && !pinStatus.pinSet) {
      // Bestaande users zonder PIN: zet eerst PIN (geen auth-blokkerende cloud rollout)
      router.push('/onboarding/pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen doorsturen wanneer pinSet van undefined→false gaat
  }, [pinStatus?.pinSet]);

  const withLoc = async () => getConsentedLocation();

  const onUnsafe = async () => {
    if (!pinStatus?.pinSet) return router.push('/onboarding/pin');
    setBusy('unsafe'); setErr(null); setMsg(null);
    try {
      const loc = await withLoc();
      const r = await startUnsafe({
        clientRef: clientRef('unsafe'),
        sessionId: mine?._id,
        torchRequested: !!pinStatus.torchStrobeOptIn,
        createTrackingLink: !!loc.locationConsent,
        shareRecordingScope: true, // scope alleen; opname start na mic-consent op /danger
        ...loc,
      });
      router.push({
        pathname: '/danger',
        params: {
          incidentId: r.incidentId ?? '',
          ...(r.sharePath ? { sharePath: r.sharePath } : {}),
        },
      });
    } catch (e) {
      setErr(errorNl(e));
    } finally { setBusy(null); }
  };

  const onCome = async () => {
    setBusy('come'); setErr(null); setMsg(null);
    try {
      const loc = await withLoc();
      await comeQuick({ clientRef: clientRef('come'), sessionId: mine?._id, ...loc });
      setMsg(myContacts.length
        ? 'Je contacten krijgen een in-app push: “Kom snel”. (Geen automatische sms/WhatsApp.)'
        : 'Melding geregistreerd. Voeg vertrouwde contacten toe zodat zij een push kunnen krijgen.');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const onSafe = () => {
    if (!pinStatus?.pinSet) return router.push('/onboarding/pin');
    setSafeOpen(true); setErr(null);
  };

  const onLiveNow = async () => {
    setBusy('come'); setErr(null); setMsg(null);
    try {
      const loc = await withLoc();
      if (!loc.locationConsent) { setErr('Locatietoestemming nodig om nu te delen.'); return; }
      const r = await sendLiveNow({ ...loc, sessionId: mine?._id });
      setMsg(r.recipients
        ? `Live locatie naar ${r.recipients} contact(en) gestuurd (in-app push).`
        : 'Locatie geregistreerd. Voeg vertrouwde contacten toe voor pushes.');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const submitSafe = async (pin: string) => {
    setBusy('safe'); setErr(null);
    try {
      const loc = await withLoc();
      const res = await verifyPin({ pin, purpose: 'arrived_safe', sessionId: mine?._id, ...loc });
      if (!res.ok) { setErr('Onjuiste code. Probeer opnieuw.'); return; }
      setSafeOpen(false);
      setMsg('Veilig aangekomen bevestigd. Eventueel alarm is gestopt.');
    } catch (e) {
      setErr(errorNl(e).includes('RATE') ? 'Te veel pogingen. Wacht even.' : 'Onjuiste code. Probeer opnieuw.');
    } finally { setBusy(null); }
  };

  return (
    <Screen>
      <H1>SafeWalk</H1>
      <P muted>Grote knoppen voor onderweg. SafeWalk is geen hulpdienst en belt 112 niet automatisch.</P>
      <ActionButtons onUnsafe={onUnsafe} onComeQuick={onCome} onSafe={onSafe} busy={busy} disabled={!!busy} />
      <Button title="📍 Stuur live locatie nu" variant="secondary" hint="Foreground-alternatief voor volume×2 (geen native background volume-hook)" onPress={onLiveNow} disabled={!!busy} />
      {safeOpen && (
        <Card>
          <PinPad title="Bevestig: ik ben veilig" hint="Voer je veiligheids-PIN in" length={6} error={err} busy={busy === 'safe'}
            onSubmit={submitSafe} onCancel={() => { setSafeOpen(false); setErr(null); }} />
        </Card>
      )}
      {err && !safeOpen && <Notice kind="danger">{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      <Button title="📞 Bel zelf 112" variant="secondary" hint="Opent de telefoon-app met 112. SafeWalk belt niet zelf." onPress={() => Linking.openURL('tel:112')} />
      {mine ? (
        <Card style={{ borderColor: mine.status === 'alert' ? '#EF4444' : '#22C55E' }}>
          <P>{mine.status === 'alert' ? '⚠️ Check-in gemist – contacten gewaarschuwd' : '🟢 Onderweg naar ' + mine.destinationLabel}</P>
          <P muted>Verwachte aankomst {new Date(mine.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · nog {formatCountdown(new Date(mine.expectedArrival).getTime() - now)}</P>
          <Button title="Sessie openen" onPress={() => router.push(`/session/${mine._id}`)} />
        </Card>
      ) : (
        <Card>
          <P>Geen actieve reis</P>
          {myContacts.length === 0 && <Notice kind="info">Voeg eerst een vertrouwd contact toe om je reis te kunnen delen.</Notice>}
          <Button title="Veilig naar huis – start reis" variant="success" disabled={myContacts.length === 0} onPress={() => router.push('/session/new')} />
        </Card>
      )}
      {watching.map((s) => (
        <Card key={s._id}>
          <P>👀 {s.ownerName} → {s.destinationLabel}</P>
          <Button title="Live kaart bekijken" variant="secondary" onPress={() => router.push(`/watch/${s._id}`)} />
        </Card>
      ))}
      <Button title="Vertrouwde contacten" variant="secondary" onPress={() => router.push('/contacts')} />
      <Button title="Geschiedenis" variant="secondary" onPress={() => router.push('/history')} />
      <Button title="Klassieke SOS (aftelling)" variant="secondary" onPress={() => router.push({ pathname: '/sos', params: mine?._id ? { sessionId: mine._id } : {} })} />
      <Button title="💬 Veiligheidsassistent" variant="secondary" onPress={() => router.push('/assistant')} />
      <Button title="⭐ Premium" variant="secondary" onPress={() => router.push('/premium')} />
      <Button title="Instellingen & privacy" variant="secondary" onPress={() => router.push('/settings')} />
      <Disclaimer />
    </Screen>
  );
}
