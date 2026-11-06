import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getVolumeSendOptIn, setVolumeSendOptIn } from '../src/lib/recordingPrefs';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Notice } from '../src/components/ui';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { useSessions } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

/**
 * Foreground deep-link: safewalk://quick-ping
 * Echt bereikbaar alternatief i.p.v. gesimuleerde volume×2 / widgets.
 */
export default function QuickPing() {
  const send = useMutation(api.incidents.sendLiveLocationNow);
  const sessions = useSessions();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const [volOpt, setVolOpt] = useState(false);
  useEffect(() => { getVolumeSendOptIn().then(setVolOpt); }, []);
  const sentNote = sent == null ? null
    : sent === 'cooldown' ? 'Volume 2×: net al verstuurd — opnieuw kan na 1 minuut.'
    : sent === 'no_consent' ? 'Volume 2×: geen locatietoestemming — niets verstuurd.'
    : sent === 'failed' ? 'Volume 2×: versturen mislukt (offline?). Probeer de knop.'
    : /^\d+$/.test(sent) ? `Volume 2×: live locatie verstuurd naar ${sent} app-contact(en).` : null;
  return (
    <Screen>
      <H1>Live locatie sturen</H1>
      <P muted>Via een link, snelkoppeling of tegel kom je hier en bevestig je altijd zelf met de knop. Volume 2× (alleen Android, alleen met SafeWalk geopend) kan direct versturen als je dat hieronder aanzet.</P>
      {sentNote && <Notice kind={sent && /^\d+$/.test(sent) ? 'ok' : 'warn'}>{sentNote}</Notice>}
      <Button title="Stuur nu naar vertrouwde contacten" loading={busy} onPress={async () => {
        setBusy(true); setErr(null); setMsg(null);
        try {
          const loc = await getConsentedLocation();
          if (!loc.locationConsent) { setErr('Locatietoestemming geweigerd — niets verstuurd.'); return; }
          const r = await send({ ...loc, sessionId: sessions?.mine?._id });
          setMsg(r.recipients ? `Verstuurd naar ${r.recipients} contact(en).` : 'Geen contacten — locatie alleen gelogd als melding.');
        } catch (e) { setErr(errorNl(e)); }
        finally { setBusy(false); }
      }} />
      {Platform.OS === 'android' && (
        <Button variant="secondary"
          title={volOpt ? 'Volume 2× verstuurt direct: AAN (tik om uit te zetten)' : 'Volume 2× direct laten versturen: UIT (tik om aan te zetten)'}
          hint="Alleen terwijl SafeWalk open is. Max. 1× per minuut. Naar je vertrouwde app-contacten, met je huidige locatie."
          onPress={async () => { const v = !volOpt; await setVolumeSendOptIn(v); setVolOpt(v); }} />
      )}
      {Platform.OS === 'android' && <P muted>Alleen terwijl SafeWalk open is, max. 1× per minuut, naar je vertrouwde app-contacten met je huidige locatie. Links en snelkoppelingen versturen nooit automatisch.</P>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </Screen>
  );
}
