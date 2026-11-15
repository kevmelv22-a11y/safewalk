import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Card, Notice, Disclaimer } from '../src/components/ui';
import { ActionButtons } from '../src/components/ActionButtons';
import { PinPad } from '../src/components/PinPad';
import { DashboardShell } from '../src/components/dashboard/DashboardShell';
import { DashboardHeader } from '../src/components/dashboard/DashboardHeader';
import { StatusPanel } from '../src/components/dashboard/StatusPanel';
import { TripPanel } from '../src/components/dashboard/TripPanel';
import { NavGrid } from '../src/components/dashboard/NavGrid';
import { useContacts, useSessions } from '../src/lib/queries';
import { formatCountdown, pinErrorNl } from '../src/lib/safety';
import { useNow } from '../src/lib/useLiveLocations';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { errorCode, errorNl } from '../src/lib/convex';
import { onPressOpen112 } from '../src/lib/dial112';
import { stopSharing } from '../src/lib/location';

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
  const [busy, setBusy] = useState<'unsafe' | 'come' | 'safe' | 'live' | null>(null);
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
    setBusy('live'); setErr(null); setMsg(null);
    try {
      const loc = await withLoc();
      if (!loc.locationConsent) { setErr('Locatietoestemming nodig om nu te delen.'); return; }
      const r = await sendLiveNow({ ...loc, sessionId: mine?._id });
      setMsg(r.recipients
        ? `Je locatie is als pushmelding naar ${r.recipients} ${r.recipients === 1 ? 'contact' : 'contacten'} gestuurd. Aflevering is niet gegarandeerd.`
        : 'Niemand heeft iets gekregen: je hebt nog geen vertrouwde contacten. Voeg ze toe bij Contacten.');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const submitSafe = async (pin: string) => {
    setBusy('safe'); setErr(null);
    try {
      const loc = await withLoc();
      const res = await verifyPin({ pin, purpose: 'arrived_safe', sessionId: mine?._id, ...loc });
      if (!res.ok) { setErr('Onjuiste code. Probeer opnieuw.'); return; }
      await stopSharing().catch(() => {});
      setSafeOpen(false);
      setMsg('Veilig aangekomen bevestigd. Eventueel alarm is gestopt.');
    } catch (e) {
      setErr(pinErrorNl(errorCode(e)));
    } finally { setBusy(null); }
  };

  const sharing = !!mine;
  const countdown = mine
    ? formatCountdown(new Date(mine.expectedArrival).getTime() - now)
    : '';

  return (
    <DashboardShell>
      <DashboardHeader />
      <StatusPanel
        sharing={sharing}
        destinationLabel={mine?.destinationLabel}
        alert={mine?.status === 'alert'}
        contactCount={myContacts.length}
      />

      <View style={{ gap: 8 }}>
        <ActionButtons onUnsafe={onUnsafe} onComeQuick={onCome} onSafe={onSafe} busy={busy === 'live' ? null : busy} disabled={!!busy} />
      </View>

      {safeOpen && (
        <Card>
          <PinPad title="Bevestig: ik ben veilig" hint="Voer je veiligheidscode in. Hoofdletters tellen mee." error={err} busy={busy === 'safe'}
            onSubmit={submitSafe} onCancel={() => { setSafeOpen(false); setErr(null); }} />
        </Card>
      )}
      {err && !safeOpen && <Notice kind="danger">{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <TripPanel
        mine={mine ? {
          _id: mine._id,
          status: mine.status,
          destinationLabel: mine.destinationLabel,
          expectedArrival: mine.expectedArrival,
        } : null}
        watching={watching.map((s) => ({
          _id: s._id,
          ownerName: s.ownerName,
          destinationLabel: s.destinationLabel,
        }))}
        contactCount={myContacts.length}
        countdown={countdown}
        onOpenMine={() => router.push(`/session/${mine!._id}`)}
        onStartTrip={() => router.push('/session/new')}
        onOpenWatch={(id) => router.push(`/watch/${id}`)}
      />

      <NavGrid
        disabled={!!busy}
        onLiveNow={onLiveNow}
        onCall112={() => { void onPressOpen112(); }}
        onContacts={() => router.push('/contacts')}
        onHistory={() => router.push('/history')}
        onSos={() => router.push({ pathname: '/sos', params: mine?._id ? { sessionId: mine._id } : {} })}
        onAssistant={() => router.push('/assistant')}
        onPremium={() => router.push('/premium')}
        onSettings={() => router.push('/settings')}
        onFakeCall={() => router.push('/fake-call')}
        onHulplijnen={() => router.push('/hulplijnen')}
        onSafePlaces={() => router.push('/veilige-plekken')}
      />

      <Disclaimer />
    </DashboardShell>
  );
}
