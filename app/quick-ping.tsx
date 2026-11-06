import { useState } from 'react';
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
  return (
    <Screen>
      <H1>Live locatie sturen</H1>
      <P muted>Dit is het huidige foreground-alternatief voor “volume 2×”. Widgets/Quick Settings tiles zijn gepland voor native builds — niet gesimuleerd hier.</P>
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
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </Screen>
  );
}
