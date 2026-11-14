import { useState, useEffect } from 'react';
import { useNow } from '../../src/lib/useLiveLocations';
import { router } from 'expo-router';
import { Platform, Share } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Button, Field, Notice, Card } from '../../src/components/ui';
import { Choice, Toggle } from '../../src/components/Choice';
import { LiveDisclosure } from '../../src/components/LiveDisclosure';
import { useContacts, useProfile } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { etaLabel, roughEtaMs, suggestMinutes, validateStartInput } from '../../src/lib/safety';
import { useTripDraft } from '../../src/store/trip';
import { useLinkCodes } from '../../src/store/linkCodes';
import * as Location from 'expo-location';
import { sharingMode, startSharing, untilFor } from '../../src/lib/location';
import { localNotify, scheduleCheckInReminder } from '../../src/lib/notifications';
import { acceptDisclosure, disclosureAccepted } from '../../src/lib/liveDisclosure';
import { tripLinkMessage } from '../../src/lib/composer';
import { CODE_HINT, LINK_KEY_WARNING, LINK_ONLY_HINT, PRIVACY_HINT, TIMER_LABELS, TIMER_MINUTES, VIEWER_ALERTS_HINT } from '../../src/content/liveSharing';
import { LINK_DURATIONS, LINK_DURATION_LABEL, type LinkDuration } from '../../convex/liveShare';

type Kind = 'trip' | 'timer';

/** Buiten de component: tijd pas bepalen op het moment van tikken. */
const arrivalIn = (mins: number) => new Date(Date.now() + mins * 60_000);

export default function NewSession() {
  const begin = useMutation(api.sessions.begin);
  const contacts = useContacts()?.mine ?? [];
  const profile = useProfile();
  const putCode = useLinkCodes((s) => s.put);
  const [kind, setKind] = useState<Kind>('trip');
  const [dest, setDest] = useState('Thuis'); const [minutes, setMinutes] = useState(20);
  const [timerLabel, setTimerLabel] = useState('Date'); const [timerMinutes, setTimerMinutes] = useState(60);
  const [sel, setSel] = useState<Id<'users'>[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [withLink, setWithLink] = useState(false); const [linkTouched, setLinkTouched] = useState(false);
  const [duration, setDuration] = useState<LinkDuration>('arrival'); const [withCode, setWithCode] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const destination = useTripDraft((s) => s.destination); const setDestination = useTripDraft((s) => s.setDestination);
  const [eta, setEta] = useState<number | null>(null);
  const now = useNow(15_000);
  // Geen contacten met de app? Dan staat de meekijklink standaard aan (tot je hem zelf uitzet).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standaardkeuze volgt de (later geladen) contactenlijst
  useEffect(() => { if (!linkTouched) setWithLink(contacts.length === 0); }, [contacts.length, linkTouched]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- formulier volgt de gekozen bestemming
    if (!destination) return setEta(null);
    setDest(destination.label);
    Location.getLastKnownPositionAsync().then((l) => {
      if (!l) return; const e = roughEtaMs({ lat: l.coords.latitude, lng: l.coords.longitude }, destination);
      setEta(e); setMinutes(suggestMinutes(e));
    }).catch(() => {});
  }, [destination]);
  const toggle = (id: Id<'users'>) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const mins = kind === 'timer' ? timerMinutes : minutes;
  const label = kind === 'timer' ? timerLabel : dest;

  const ask = async () => {
    setErr(null);
    if (profile && profile.ageStatus !== 'adult') return setErr('Delen kan pas vanaf 16 jaar. Onder 16 blijft dit dicht.');
    const v = validateStartInput({ destination: label, arrival: arrivalIn(mins), viewerIds: sel, withLink }); if (v) return setErr(v);
    if (await disclosureAccepted()) return start();
    setDisclose(true);
  };

  const start = async () => {
    const arrival = arrivalIn(mins);
    setBusy(true); setErr(null);
    let id: Id<'sessions'>; let link: Awaited<ReturnType<typeof begin>>['link'] = null;
    try {
      const r = await begin({
        kind, destination: label.trim(), viewerIds: sel, expectedArrival: arrival.getTime(), privacyMode,
        ...(kind === 'trip' && destination ? { destLat: destination.lat, destLng: destination.lng } : {}),
        ...(withLink ? { link: { duration, withCode, locationConsent: true } } : {}),
      });
      id = r.sessionId; link = r.link; setDestination(null);
    } catch (e) { setBusy(false); return setErr(errorNl(e)); }
    if (link?.accessCode) putCode(link.id, link.accessCode);
    let shared = true;
    try { await startSharing(id, { until: untilFor(arrival.getTime() + 2 * 3600_000) }); }
    catch { shared = false; } // reisscherm toont dan "niet gedeeld" + knop om te hervatten
    await scheduleCheckInReminder(arrival).catch(() => {});
    await localNotify(kind === 'timer' ? 'Timer gestart' : 'Reis gestart', !shared
      ? 'Let op: je locatie wordt nog niet gedeeld (geen toestemming). De check-in loopt wel.'
      : sharingMode() === 'background'
        ? 'Je locatie wordt gedeeld, ook met scherm uit, tot je aankomst bevestigt of stopt.'
        : 'Je locatie wordt gedeeld zolang SafeWalk open is, tot je aankomst bevestigt of stopt.').catch(() => {});
    if (link) {
      const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
      const text = tripLinkMessage(`${site}${link.path}`);
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
        else await Share.share({ message: text });
      } catch { /* delen kan ook later vanaf het reisscherm */ }
    }
    setBusy(false);
    router.replace(`/session/${id}`);
  };

  return (
    <Screen>
      <H1>{kind === 'timer' ? 'Timer starten' : 'Reis starten'}</H1>
      <Choice label="Soort" value={kind} onChange={setKind} options={[{ value: 'trip', label: '📍 Reis met bestemming' }, { value: 'timer', label: '⏱️ Timer zonder bestemming' }]} />
      {kind === 'trip' ? (<>
        <Field label="Bestemming" value={dest} onChangeText={setDest} />
        <Button title={destination ? `📍 ${destination.label} (wijzigen)` : '📍 Kies bestemming op kaart (optioneel)'} variant="secondary" onPress={() => router.push('/session/destination')} />
        {eta !== null && <P muted>Geschat: {etaLabel(eta)}. Kies zelf een ruime aankomsttijd.</P>}
        <P>Ik verwacht er te zijn over</P>
        <Choice label="Verwachte reistijd" value={minutes} onChange={setMinutes} options={[10, 20, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` }))} />
      </>) : (<>
        <P muted>Voor als je geen bestemming hebt, zoals een date of een rondje lopen. Als de timer afloopt, vraagt SafeWalk of alles goed is; bevestig je niet, dan worden je kijkers gewaarschuwd.</P>
        <Choice label="Waarvoor" value={TIMER_LABELS.includes(timerLabel) ? timerLabel : ''} onChange={setTimerLabel} options={TIMER_LABELS.map((l) => ({ value: l, label: l }))} />
        <Field label="Omschrijving" value={timerLabel} onChangeText={setTimerLabel} maxLength={60} />
        <P>Hoe lang?</P>
        <Choice label="Duur van de timer" value={timerMinutes} onChange={setTimerMinutes} options={TIMER_MINUTES.map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} u`.replace('.5', ',5') }))} />
      </>)}
      <P muted>{kind === 'timer' ? 'Timer loopt af' : 'Verwachte aankomst'}: {new Date(now + mins * 60_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</P>

      <Card>
        <P>Wie mag meekijken in de app?</P>
        {contacts.length === 0 && <P muted>Je hebt nog geen vertrouwde contacten met de app. {LINK_ONLY_HINT}</P>}
        {contacts.map((c) => <Button key={c.userId} title={`${sel.includes(c.userId) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.userId) ? 'success' : 'secondary'} onPress={() => toggle(c.userId)} />)}
        {contacts.length > 0 && <P muted>Alleen deze personen zien het in de app, en alleen tot de reis eindigt.</P>}
      </Card>

      <Card>
        <Toggle value={withLink} onChange={(v) => { setLinkTouched(true); setWithLink(v); }} title="Meekijklink voor iemand zonder app" hint="Na het starten opent het deelvenster (WhatsApp, sms…). Jij tikt zelf op versturen." />
        {withLink && (<>
          <P muted>Hoe lang werkt de link?</P>
          <Choice label="Duur van de link" value={duration} onChange={setDuration} options={LINK_DURATIONS.map((d) => ({ value: d, label: LINK_DURATION_LABEL[d] }))} />
          <Toggle value={withCode} onChange={setWithCode} title="Toegangscode toevoegen" hint={CODE_HINT} />
          <Notice kind="warn">{LINK_KEY_WARNING}</Notice>
          <P muted style={{ fontSize: 14 }}>{VIEWER_ALERTS_HINT}</P>
        </>)}
      </Card>

      <Card>
        <Toggle value={privacyMode} onChange={setPrivacyMode} title="Privacy-check-in: alleen status delen" hint={PRIVACY_HINT} />
      </Card>

      <Notice kind="info">Je locatie wordt gedeeld vanaf het starten tot je aankomst bevestigt, stopt of de {kind === 'timer' ? 'timer' : 'reis'} verloopt, ook met scherm uit (Android: met een vaste melding). Veeg SafeWalk tijdens je reis niet weg.</Notice>
      {err && <Notice kind="warn">{err}</Notice>}
      <Button title={kind === 'timer' ? 'Start timer en deel' : 'Start en deel locatie'} variant="success" onPress={ask} loading={busy} />
      <LiveDisclosure visible={disclose} privacyMode={privacyMode}
        onAccept={async () => { setDisclose(false); await acceptDisclosure(); await start(); }}
        onCancel={() => setDisclose(false)} />
    </Screen>
  );
}
