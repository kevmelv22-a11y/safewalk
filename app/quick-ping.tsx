import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getVolumeSendOptIn, setVolumeSendOptIn } from '../src/lib/recordingPrefs';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Notice, Card } from '../src/components/ui';
import { QUICK_LOCATION, volumeSentNote } from '../src/content/quickLocation';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { useContacts, useSessions } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

/**
 * safewalk://quick-ping (tegel, snelkoppeling, volume-omhoog 2×).
 * Stuurt één locatie-push; links en snelkoppelingen versturen nooit automatisch.
 */
export default function QuickPing() {
  const send = useMutation(api.incidents.sendLiveLocationNow);
  const sessions = useSessions();
  const contacts = useContacts()?.mine;
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const [volOpt, setVolOpt] = useState(false);
  useEffect(() => { getVolumeSendOptIn().then(setVolOpt); }, []);
  const note = volumeSentNote(sent);
  return (
    <Screen>
      <H1>{QUICK_LOCATION.title}</H1>
      <P muted>{QUICK_LOCATION.screenIntro}</P>
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      {contacts !== undefined && contacts.length === 0 && (
        <Notice kind="warn">Je hebt nog geen vertrouwde contacten in de app. Zonder contacten krijgt niemand je locatie.</Notice>
      )}
      <Button title="Stuur nu naar vertrouwde contacten" loading={busy} onPress={async () => {
        setBusy(true); setErr(null); setMsg(null);
        try {
          const loc = await getConsentedLocation();
          if (!loc.locationConsent) { setErr('Geen locatietoestemming: niets verstuurd.'); return; }
          const r = await send({ ...loc, sessionId: sessions?.mine?._id });
          setMsg(r.recipients
            ? `Je locatie is als pushmelding naar ${r.recipients} ${r.recipients === 1 ? 'contact' : 'contacten'} gestuurd. Aflevering is niet gegarandeerd.`
            : 'Niemand heeft iets gekregen: je hebt nog geen vertrouwde contacten.');
        } catch (e) { setErr(errorNl(e)); }
        finally { setBusy(false); }
      }} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      {Platform.OS === 'android' && (
        <Card>
          <P muted>{QUICK_LOCATION.volumeAndroid}</P>
          <Button variant="secondary"
            title={volOpt ? QUICK_LOCATION.volumeToggleOn : QUICK_LOCATION.volumeToggleOff}
            hint={QUICK_LOCATION.volumeToggleHint}
            onPress={async () => { const v = !volOpt; await setVolumeSendOptIn(v); setVolOpt(v); }} />
        </Card>
      )}
      <P muted>{QUICK_LOCATION.shortcuts}</P>
    </Screen>
  );
}
