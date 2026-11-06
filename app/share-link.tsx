import { useState } from 'react';
import { Share, Platform } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { useSessions } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

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
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';

  const make = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await create({ sessionId: sessions?.mine?._id, label: 'Live locatie' });
      const url = `${site}${r.path}`;
      const text = `Ik deel mijn live locatie via SafeWalk (tijdelijk, intrekbaar): ${url}\nSafeWalk belt niet 112.`;
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
      <H1>Tracking-link</H1>
      <P muted>Maak een tijdelijke link (standaard 2 uur) met live kaart voor iemand zonder de app. De link bevat geen coördinaten in de URL. Intrekken kan hieronder.</P>
      <Notice kind="info">Techniek: Convex HTTP + Leaflet + OpenStreetMap-tegels (© OSM-bijdragers). Poll elke 10s. Geen betaalde kaart-API.</Notice>
      <Button title="Nieuwe link maken en delen" onPress={make} loading={busy} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      <H1>Actieve links</H1>
      {links.length === 0 && <P muted>Geen links.</P>}
      {links.map((l) => (
        <Card key={l.id}>
          <P>{l.label ?? 'Link'} · {l.expired ? 'verlopen' : `tot ${new Date(l.expiresAt).toLocaleString('nl-NL')}`}</P>
          {!l.expired && <Button title="Intrekken" variant="danger" onPress={() => revoke({ id: l.id })} />}
        </Card>
      ))}
    </Screen>
  );
}
