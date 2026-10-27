import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { registerPush } from '../../src/lib/notifications';
import { useUserId } from '../../src/lib/queries';

export default function NotificationPermission() {
  const uid = useUserId(); const [msg, setMsg] = useState<string | null>(null);
  return (
    <Screen>
      <H1>Meldingen</H1>
      <P>Meldingen zijn nodig om je te vragen of alles goed is (check-in) en om je te waarschuwen als een contact SOS activeert of niet op tijd aankomt.</P>
      <Notice kind="warn">Pushmeldingen worden niet gegarandeerd afgeleverd (bijv. bij geen internet, stille modus of ‘Niet storen’).</Notice>
      {msg && <Notice kind="warn">{msg}</Notice>}
      <Button title="Meldingen toestaan" onPress={async () => {
        const tok = uid ? await registerPush(uid).catch(() => null) : null;
        if (tok) router.push('/onboarding/contacts'); else setMsg('Meldingen niet ingeschakeld (of geen fysiek toestel). Je kunt dit later in je telefooninstellingen wijzigen.');
      }} />
      <Button title="Doorgaan" variant="secondary" onPress={() => router.push('/onboarding/contacts')} />
    </Screen>
  );
}
