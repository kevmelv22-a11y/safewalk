import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { startSharing, stopSharing, untilFor, lastKnown } from '../src/lib/location';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { errorNl } from '../src/lib/convex';
import { COPY as DialCopy, onPressOpen112 } from '../src/lib/dial112';
import { ContactComposer } from '../src/components/ContactComposer';
import { reserveSmsMessage } from '../src/lib/composer';

/** Kindermodus: één grote SOS, aankomst thuis/school, zichtbare deel-melding. Geen SOS-uitknop. */
export default function KindHome() {
  const profile = useProfile();
  const link = useQuery(api.childLinks.myLink);
  const startShare = useMutation(api.childLinks.startShare);
  const stopShare = useMutation(api.childLinks.stopShare);
  const arrived = useMutation(api.childLinks.arrived);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [smsLoc, setSmsLoc] = useState<{ lat?: number; lng?: number }>({});

  useEffect(() => { void lastKnown().then((l) => { if (l) setSmsLoc({ lat: l.lat, lng: l.lng }); }).catch(() => {}); }, []);

  useEffect(() => {
    if (!link?.linkId) return;
    let cancelled = false;
    (async () => {
      try {
        const sid = await startShare({});
        if (cancelled) return;
        await startSharing(sid, { until: untilFor(Date.now() + 8 * 3600_000) }).catch(() => {});
      } catch (e) { if (!cancelled) setErr(errorNl(e)); }
    })();
    return () => { cancelled = true; };
  }, [link?.linkId, startShare]);

  if (profile === undefined || link === undefined) return <Screen><P>Laden…</P></Screen>;
  if (profile && profile.ageStatus === 'adult') return <Redirect href="/dashboard" />;
  if (profile && profile.ageStatus !== 'minor') return <Redirect href="/age" />;
  if (!link) return <Redirect href="/kind/koppelen" />;

  const names = [link.parentName, ...link.contactNames].filter(Boolean);
  const shareLine = names.length
    ? `Je locatie wordt gedeeld met ${names.join(', ')}.`
    : `Je locatie wordt gedeeld met ${link.parentName}.`;

  const onArrived = async (place: 'home' | 'school') => {
    setBusy(place); setErr(null); setMsg(null);
    try {
      const loc = await getConsentedLocation();
      await arrived({
        place,
        ...(loc.locationConsent ? { lat: loc.lat, lng: loc.lng, locationAt: loc.locationAt } : {}),
      });
      setMsg(place === 'home' ? 'Je ouder krijgt: veilig thuis aangekomen.' : 'Je ouder krijgt: veilig op school aangekomen.');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const onStop = async () => {
    setBusy('stop'); setErr(null);
    try {
      await stopShare({});
      await stopSharing().catch(() => {});
      setMsg('Delen gestopt. Je ouder ziet de laatst bekende locatie en dat de verbinding is verbroken. SOS blijft beschikbaar.');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  return (
    <Screen>
      <H1>Kindermodus</H1>
      <Notice kind="warn">{shareLine} Alleen terwijl SafeWalk open is of de locatiemelding zichtbaar is. Geen 24-uurs volgmodus.</Notice>
      <Button title="SOS" variant="danger" onPress={() => router.push({ pathname: '/sos', params: link.sessionId ? { sessionId: link.sessionId } : {} })}
        hint="Waarschuwt je ouder en de contacten die je ouder koos. Belt niet 112." />
      <Button title="Ik ben veilig thuis" variant="success" onPress={() => { void onArrived('home'); }} loading={busy === 'home'} disabled={!!busy} />
      <Button title="Ik ben veilig op school" variant="success" onPress={() => { void onArrived('school'); }} loading={busy === 'school'} disabled={!!busy} />
      <Button title={DialCopy.title} variant="danger" hint={DialCopy.hint} onPress={() => { void onPressOpen112(); }} />
      <Notice kind="info">Zonder internet kun je zelf een vooringevulde sms versturen. SafeWalk verstuurt geen sms, ook niet automatisch: Play en iPhone staan dat niet toe.</Notice>
      <ContactComposer message={reserveSmsMessage({ lat: smsLoc.lat, lng: smsLoc.lng, context: 'sos' })} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      {link.sharing && <Button title="Locatie delen stoppen" variant="secondary" onPress={() => { void onStop(); }} loading={busy === 'stop'} disabled={!!busy}
        hint="SOS blijft bestaan. Je ouder ziet daarna de laatst bekende locatie." />}
      <Button title="Privacybeleid" variant="secondary" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}
