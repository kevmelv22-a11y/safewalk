import { useState } from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Button, Card, Notice } from '../../src/components/ui';
import { useContacts } from '../../src/lib/queries';
import { getConsentedLocation } from '../../src/lib/locationOnce';
import { mapsQueryUrl, validCoords } from '../../src/lib/coords';
import { errorNl } from '../../src/lib/convex';

function when(ts: number | null) {
  if (!ts) return 'onbekend';
  return new Date(ts).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function OuderKind() {
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const id = linkId as Id<'childLinks'>;
  const status = useQuery(api.childLinks.parentChildStatus, linkId ? { linkId: id } : 'skip');
  const contacts = useContacts();
  const setContacts = useMutation(api.childLinks.setContacts);
  const setGeofence = useMutation(api.childLinks.setGeofence);
  const clearGeofence = useMutation(api.childLinks.clearGeofence);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = contacts?.mine ?? [];

  if (status === undefined) return <Screen><P>Laden…</P></Screen>;
  if (status === null) return <Screen><Notice kind="danger">Deze koppeling is niet gevonden of ingetrokken.</Notice></Screen>;

  const toggleContact = async (userId: Id<'users'>) => {
    const have = new Set((status.contacts ?? []).map((c) => c.userId));
    if (have.has(userId)) have.delete(userId); else have.add(userId);
    setBusy('contacts'); setErr(null);
    try { await setContacts({ linkId: id, contactIds: [...have] }); setMsg('Contacten bijgewerkt.'); }
    catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const here = async (kind: 'home' | 'school') => {
    setBusy(kind); setErr(null); setMsg(null);
    try {
      const loc = await getConsentedLocation();
      if (!loc.locationConsent || loc.lat === undefined || loc.lng === undefined) {
        setErr('Locatietoestemming is nodig. Ga naar de plek en probeer het opnieuw.');
        return;
      }
      await setGeofence({ linkId: id, kind, lat: loc.lat, lng: loc.lng, radiusM: 150 });
      setMsg(kind === 'home' ? 'Thuis ingesteld op je huidige locatie (straal 150 m).' : 'School ingesteld op je huidige locatie (straal 150 m).');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const last = status.last;
  const maps = last && validCoords(last.lat, last.lng) ? mapsQueryUrl(last.lat, last.lng) : null;

  return (
    <Screen>
      <H1>{status.childName ?? 'Kind'}</H1>
      {status.disconnected ? (
        <Notice kind="warn">
          {status.sharing
            ? `Verbinding verbroken. Laatst gezien: ${when(status.lastSeenAt)} (Europe/Amsterdam). De getoonde locatie kan verouderd zijn.`
            : `Er wordt nu geen locatie gedeeld. Laatst gezien: ${when(status.lastSeenAt)} (Europe/Amsterdam).`}
        </Notice>
      ) : (
        <Notice kind="ok">{`Live locatie. Laatst bijgewerkt: ${when(status.lastSeenAt ?? last?.recordedAt ?? null)} (Europe/Amsterdam).`}</Notice>
      )}
      {status.batteryPct != null && <P muted>{`Batterij: ${status.batteryPct}%`}</P>}
      {last && <P muted>{`Laatst bekende locatie ±${last.accuracyM != null ? Math.round(last.accuracyM) : '?'} m, ${when(last.recordedAt)} (Europe/Amsterdam).`}</P>}
      {maps && <Button title="Open laatste locatie in Google Maps" variant="secondary" onPress={() => { void Linking.openURL(maps); }} />}
      <Card>
        <P>Zones (alleen gecontroleerd terwijl het kind deelt)</P>
        {(status.fences ?? []).map((f) => (
          <P key={f.kind} muted>{`${f.label} (${f.kind === 'home' ? 'thuis' : 'school'}), straal ${f.radiusM} m${f.lastInside ? ' · nu binnen' : ''}`}</P>
        ))}
        <Button title="Stel thuis in op mijn locatie" variant="secondary" onPress={() => { void here('home'); }} loading={busy === 'home'} />
        <Button title="Stel school in op mijn locatie" variant="secondary" onPress={() => { void here('school'); }} loading={busy === 'school'} />
        <Button title="Wis thuis" variant="secondary" onPress={() => { void clearGeofence({ linkId: id, kind: 'home' }); }} />
        <Button title="Wis school" variant="secondary" onPress={() => { void clearGeofence({ linkId: id, kind: 'school' }); }} />
      </Card>
      <Card>
        <P>SOS-contacten (naast jijzelf)</P>
        <P muted>Alleen vertrouwde contacten uit jouw lijst. Het kind kan deze lijst niet wijzigen en SOS niet uitzetten.</P>
        {mine.length === 0 && <P muted>Je hebt nog geen vertrouwde contacten.</P>}
        {mine.map((c) => {
          const on = (status.contacts ?? []).some((x) => x.userId === c.userId);
          return (
            <Button key={c.userId} title={`${on ? '✓ ' : ''}${c.name}`} variant="secondary"
              onPress={() => { void toggleContact(c.userId); }} disabled={busy === 'contacts'} />
          );
        })}
      </Card>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </Screen>
  );
}
