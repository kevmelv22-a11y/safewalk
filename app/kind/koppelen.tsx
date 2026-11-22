import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Field, Notice } from '../../src/components/ui';
import { useProfile } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';

export default function KindKoppelen() {
  const { t } = useTranslation();
  const profile = useProfile();
  const link = useQuery(api.childLinks.myLink);
  const accept = useMutation(api.childLinks.acceptInvite);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile?.ageStatus === 'adult') return <Redirect href="/dashboard" />;
  if (link?.linkId) return <Redirect href="/kind" />;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await accept({ code });
      router.replace('/kind');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>{t('flow.kind.linkTitle')}</H1>
      <P>{t('flow.kind.linkBody')}</P>
      <Notice kind="info">{t('flow.kind.linkInfo')}</Notice>
      <Field label={t('flow.kind.code')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} />
      <Button title={t('flow.kind.linkBtn')} onPress={submit} loading={busy} disabled={code.trim().length < 6} />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title={t('common.back')} variant="secondary" onPress={() => router.replace('/age')} />
    </Screen>
  );
}
