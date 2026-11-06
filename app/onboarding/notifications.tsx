import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { registerPush } from '../../src/lib/notifications';

export default function NotificationPermission() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Screen>
      <H1>Meldingen</H1>
      <P>Meldingen zijn nodig om je te vragen of alles goed is (check-in) en om je te waarschuwen als een contact SOS activeert of niet op tijd aankomt.</P>
      <Notice kind="warn">Pushmeldingen worden niet gegarandeerd afgeleverd (geen internet, stille modus, ‘Niet storen’, of ontbrekende APNs/FCM-config bij de bouwer).</Notice>
      {msg && <Notice kind="warn">{msg}</Notice>}
      <Button title="Meldingen toestaan" onPress={async () => {
        const r = await registerPush().catch(() => ({ ok: false as const, reason: 'token_failed' as const, detail: 'onbekend' }));
        if (r.ok) router.push('/onboarding/contacts');
        else {
          const map: Record<string, string> = {
            web: 'Web ondersteunt geen push-tokens.',
            simulator: 'Geen fysiek toestel — push later op een echte telefoon.',
            permission_denied: 'Toestemming geweigerd. Je kunt dit later in telefooninstellingen wijzigen.',
            no_project_id: 'Push-config incompleet (projectId).',
            token_failed: 'Token ophalen mislukt — vaak ontbrekende APNs-key in Expo (niet hier in te stellen).',
            register_failed: 'Token kon niet op de server worden opgeslagen.',
          };
          setMsg(map[r.reason] ?? r.detail ?? 'Meldingen niet ingeschakeld.');
        }
      }} />
      <Button title="Doorgaan" variant="secondary" onPress={() => router.push('/onboarding/contacts')} />
    </Screen>
  );
}
