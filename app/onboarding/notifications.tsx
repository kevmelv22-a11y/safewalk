import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { registerPush } from '../../src/lib/notifications';
import { pushResultNl } from '../../src/lib/settingsCopy';

export default function NotificationPermission() {
  const { t } = useTranslation();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Screen>
      <H1>{t('flow.onboard.notifTitle')}</H1>
      <P>{t('flow.onboard.notifBody')}</P>
      <Notice kind="warn">{t('flow.onboard.notifWarn')}</Notice>
      {msg && <Notice kind="warn">{msg}</Notice>}
      <Button title={t('flow.onboard.notifAllow')} onPress={async () => {
        const r = await registerPush().catch(() => ({ ok: false as const, reason: 'token_failed' as const, detail: 'onbekend' }));
        if (r.ok) router.push('/onboarding/contacts');
        else {
          setMsg(pushResultNl(r.reason, r.detail));
        }
      }} />
      <Button title={t('flow.onboard.continue')} variant="secondary" onPress={() => router.push('/onboarding/contacts')} />
    </Screen>
  );
}
