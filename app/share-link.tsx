import { useState } from 'react';
import { Share, Platform } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { useProfile, useSessions } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';
import * as Location from 'expo-location';
import { ContactComposer } from '../src/components/ContactComposer';
import { locationMessage } from '../src/lib/composer';
import { Choice, Toggle } from '../src/components/Choice';
import { useLinkCodes } from '../src/store/linkCodes';
import { CODE_HINT, LINK_KEY_WARNING } from '../src/content/liveSharing';
import { LINK_DURATIONS, LINK_DURATION_LABEL, type LinkDuration } from '../convex/liveShare';

/**
 * Externe tracking-link voor contacten zonder app.
 * Delen via OS share sheet (sms/WhatsApp) — gebruiker bevestigt Send zelf.
 */
export default function ShareLinkScreen() {
  const create = useMutation(api.tracking.createShareLink);
  const revoke = useMutation(api.tracking.revokeShareLink);
  const links = useQuery(api.tracking.myShareLinks) ?? [];
  const sessions = useSessions();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [composerText, setComposerText] = useState<string | null>(null);
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
  const profile = useProfile();
  const [duration, setDuration] = useState<LinkDuration>('1h');
  const [withCode, setWithCode] = useState(false);
  const codes = useLinkCodes((x) => x.codes); const putCode = useLinkCodes((x) => x.put);
  const hasTrip = !!sessions?.mine?._id;

  const make = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (profile?.ageStatus !== 'adult') { setErr('Een locatielink kan pas vanaf 16 jaar. Onder 16 blijft dit dicht.'); return; }
      // Explicit consent: the user pressed this button AND granted location permission (asked here if needed).
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setErr('Zonder locatietoestemming maakt SafeWalk geen locatielink.'); return; }
      const locOk = true;
      const r = await create({
        sessionId: sessions?.mine?._id,
        label: 'Live locatie',
        locationConsent: locOk,
        scopes: ['location'],
        // "Tot aankomst" alleen met een lopende reis; anders valt de server terug op 2 uur.
        duration: duration === 'arrival' && !hasTrip ? '1h' : duration,
        withCode,
      });
      if (r.accessCode) putCode(r.id, r.accessCode);
      const url = `${site}${r.path}`;
      const text = locationMessage(url);
      setComposerText(text);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setMsg('Link gekopieerd. Plak in sms/WhatsApp — jij bevestigt zelf “versturen”.');
      } else {
        await Share.share({ message: text });
        setMsg('Deelvenster geopend. Externe sms/WhatsApp is pas verstuurd als jij op Send tikt.');
      }
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Meekijklink</H1>
      <P muted>Een tijdelijke link met kaart voor iemand zonder de app. De ontvanger ziet alleen live locatie zolang jij een reis of noodsituatie hebt lopen; anders staat er “niet live”. Er staan geen coördinaten in de link zelf. Je kunt hem hieronder altijd intrekken.</P>
      <P muted>Hoe lang werkt de link?</P>
      <Choice label="Duur van de link" value={duration} onChange={setDuration} options={LINK_DURATIONS.filter((d) => d !== 'arrival' || hasTrip).map((d) => ({ value: d, label: LINK_DURATION_LABEL[d] }))} />
      <Toggle value={withCode} onChange={setWithCode} title="Toegangscode toevoegen" hint={CODE_HINT} />
      <Notice kind="warn">{LINK_KEY_WARNING}</Notice>
      <Button title="Nieuwe link maken en delen" onPress={make} loading={busy} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {composerText && <ContactComposer message={composerText} />}
      {err && <Notice kind="danger">{err}</Notice>}
      <H1>Actieve links</H1>
      {links.length === 0 && <P muted>Geen links.</P>}
      {links.map((l) => (
        <Card key={l.id}>
          <P>{l.label ?? 'Link'} · {l.expired ? 'verlopen' : `tot ${new Date(l.expiresAt).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}</P>
          {l.hasCode && <P muted>{codes[l.id] ? `Toegangscode: ${codes[l.id].slice(0, 3)} ${codes[l.id].slice(3)}` : 'Met toegangscode'}{l.codeLocked ? ' · geblokkeerd na te veel foute codes' : ''}</P>}
          {l.emailSubscribers > 0 && <P muted>{l.emailSubscribers} {l.emailSubscribers === 1 ? 'kijker krijgt' : 'kijkers krijgen'} e-mailmeldingen.</P>}
          {!l.expired && <Button title="Link intrekken" variant="danger" onPress={() => revoke({ id: l.id }).catch((e) => setErr(errorNl(e)))} />}
        </Card>
      ))}
    </Screen>
  );
}
