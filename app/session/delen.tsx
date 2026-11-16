import { useState, useEffect } from 'react';
import { useNow } from '../../src/lib/useLiveLocations';
import { router } from 'expo-router';
import { Platform, Share } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Button, Notice, Card } from '../../src/components/ui';
import { Choice, Toggle } from '../../src/components/Choice';
import { LiveDisclosure } from '../../src/components/LiveDisclosure';
import { useContacts, useProfile } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { validateShareInput } from '../../src/lib/safety';
import { useLinkCodes } from '../../src/store/linkCodes';
import { sharingMode, startSharing, untilFor } from '../../src/lib/location';
import { localNotify } from '../../src/lib/notifications';
import { acceptDisclosure, disclosureAccepted } from '../../src/lib/liveDisclosure';
import { tripLinkMessage } from '../../src/lib/composer';
import { CODE_HINT, LINK_KEY_WARNING, LINK_ONLY_HINT, VIEWER_ALERTS_HINT } from '../../src/content/liveSharing';
import { SHARE_COPY } from '../../src/content/longShare';
import { LINK_DURATIONS, LINK_DURATION_LABEL, type LinkDuration } from '../../convex/liveShare';
import { SHARE_DURATIONS, SHARE_DURATION_LABEL, SHARE_DEFAULT_LABEL, SHARE_UNTIL_STOP_LABEL, shareExpiry, type ShareDuration } from '../../convex/longShare';

export default function Delen() {
  const begin = useMutation(api.sessions.begin);
  const contacts = useContacts()?.mine ?? [];
  const profile = useProfile();
  const putCode = useLinkCodes((s) => s.put);
  const [duration, setDuration] = useState<ShareDuration>('4h');
  const [sel, setSel] = useState<Id<'users'>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withLink, setWithLink] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [linkDuration, setLinkDuration] = useState<LinkDuration>('arrival');
  const [withCode, setWithCode] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const now = useNow(15_000);
  const { endsAt, untilStop } = shareExpiry(duration, now);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standaardkeuze volgt de (later geladen) contactenlijst
  useEffect(() => { if (!linkTouched) setWithLink(contacts.length === 0); }, [contacts.length, linkTouched]);

  const toggle = (id: Id<'users'>) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const ask = async () => {
    setErr(null);
    if (profile && profile.ageStatus !== 'adult') return setErr(SHARE_COPY.ageBlocked);
    const v = validateShareInput({ arrival: new Date(endsAt), viewerIds: sel, withLink });
    if (v) return setErr(v);
    if (await disclosureAccepted()) return start();
    setDisclose(true);
  };

  const start = async () => {
    setBusy(true); setErr(null);
    const label = untilStop ? SHARE_UNTIL_STOP_LABEL : SHARE_DEFAULT_LABEL;
    let id: Id<'sessions'>; let link: Awaited<ReturnType<typeof begin>>['link'] = null;
    try {
      const r = await begin({
        kind: 'share',
        destination: label,
        viewerIds: sel,
        expectedArrival: endsAt,
        shareUntilStop: untilStop,
        ...(withLink ? { link: { duration: linkDuration, withCode, locationConsent: true } } : {}),
      });
      id = r.sessionId; link = r.link;
    } catch (e) { setBusy(false); return setErr(errorNl(e)); }
    if (link?.accessCode) putCode(link.id, link.accessCode);
    let shared = true;
    try { await startSharing(id, { until: untilFor(endsAt) }); }
    catch { shared = false; }
    await localNotify('Locatie delen gestart', !shared
      ? 'Let op: je locatie wordt nog niet gedeeld (geen toestemming).'
      : sharingMode() === 'background'
        ? 'Je locatie wordt gedeeld, ook met scherm uit, tot de gekozen tijd of tot jij stopt.'
        : 'Je locatie wordt gedeeld zolang SafeWalk open is, tot de gekozen tijd of tot jij stopt.').catch(() => {});
    if (link) {
      const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
      const text = tripLinkMessage(`${site}${link.path}`);
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
        else await Share.share({ message: text });
      } catch { /* later delen vanaf het sessiescherm */ }
    }
    setBusy(false);
    router.replace(`/session/${id}`);
  };

  return (
    <Screen>
      <H1>{SHARE_COPY.title}</H1>
      <P muted>{SHARE_COPY.intro}</P>
      <P>Hoe lang wil je delen?</P>
      <Choice
        label="Duur van het delen"
        value={duration}
        onChange={setDuration}
        options={SHARE_DURATIONS.map((d) => ({ value: d, label: SHARE_DURATION_LABEL[d] }))}
      />
      <P muted>{untilStop ? SHARE_COPY.untilStopHint : SHARE_COPY.limitHint}</P>
      <P muted>{untilStop ? SHARE_COPY.activeUntilStop : SHARE_COPY.activeUntil}{' '}
        {new Date(endsAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', weekday: 'short' })}
      </P>

      <Card>
        <P>Wie mag meekijken in de app?</P>
        {contacts.length === 0 && <P muted>Je hebt nog geen vertrouwde contacten met de app. {LINK_ONLY_HINT}</P>}
        {contacts.map((c) => (
          <Button key={c.userId} title={`${sel.includes(c.userId) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.userId) ? 'success' : 'secondary'} onPress={() => toggle(c.userId)} />
        ))}
      </Card>

      <Card>
        <Toggle value={withLink} onChange={(v) => { setLinkTouched(true); setWithLink(v); }} title="Meekijklink voor iemand zonder app" hint="Na het starten opent het deelvenster. Jij tikt zelf op versturen." />
        {withLink && (<>
          <P muted>Hoe lang werkt de link? “Tot aankomst” volgt het einde van dit delen, nooit langer dan 24 uur.</P>
          <Choice label="Duur van de link" value={linkDuration} onChange={setLinkDuration} options={LINK_DURATIONS.map((d) => ({ value: d, label: LINK_DURATION_LABEL[d] }))} />
          <Toggle value={withCode} onChange={setWithCode} title="Toegangscode toevoegen" hint={CODE_HINT} />
          <Notice kind="warn">{LINK_KEY_WARNING}</Notice>
          <P muted>{VIEWER_ALERTS_HINT}</P>
        </>)}
      </Card>

      {err && <Notice kind="danger">{err}</Notice>}
      <Button title={SHARE_COPY.start} onPress={() => { void ask(); }} loading={busy} />
      <Button title="Annuleren" variant="secondary" onPress={() => router.back()} />
      <LiveDisclosure visible={disclose} privacyMode={false} onAccept={() => { void acceptDisclosure().then(() => { setDisclose(false); void start(); }); }} onCancel={() => setDisclose(false)} />
    </Screen>
  );
}
