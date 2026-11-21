import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { registerPush } from '../../src/lib/notifications';
import { pushResultNl } from '../../src/lib/settingsCopy';

export default function NotificationPermission() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Screen>
      <H1>Meldingen</H1>
      <P>Meldingen zijn nodig om je te vragen of alles goed is (check-in) en om je te waarschuwen als een contact SOS activeert of niet op tijd aankomt.</P>
      <Notice kind="warn">Pushmeldingen worden niet gegarandeerd afgeleverd (bijvoorbeeld zonder internet, met ‘Niet storen’ of als de telefoon de app in slaap houdt).</Notice>
      {msg && <Notice kind="warn">{msg}</Notice>}
      <Button title="Meldingen toestaan" onPress={async () => {
        const r = await registerPush().catch(() => ({ ok: false as const, reason: 'token_failed' as const, detail: 'onbekend' }));
        if (r.ok) router.push('/onboarding/contacts');
        else {
          setMsg(pushResultNl(r.reason, r.detail));
        }
      }} />
      <Button title="Doorgaan" variant="secondary" onPress={() => router.push('/onboarding/contacts')} />
    </Screen>
  );
}
