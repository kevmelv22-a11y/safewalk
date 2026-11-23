import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../../src/components/ui';
import { Toggle } from '../../src/components/Choice';
import { CHILD_CONSENT_NL } from '../../src/lib/childConsent';
import { errorNl } from '../../src/lib/convex';

export default function KinderenSettings() {
  const { t } = useTranslation();
  const list = useQuery(api.childLinks.listForParent);
  const createInvite = useMutation(api.childLinks.createInvite);
  const revoke = useMutation(api.childLinks.revoke);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expires, setExpires] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true); setErr(null); setCode(null);
    try {
      const r = await createInvite({ consentAccepted: consent });
      setCode(r.code);
      setExpires(r.expiresAt);
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  const until = expires
    ? new Date(expires).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) + ' (Europe/Amsterdam)'
    : '';

  return (
    <Screen>
      <H1>{t('flow.kids.title')}</H1>
      <Notice kind="warn">{t('flow.kids.warn')}</Notice>
      <P>{CHILD_CONSENT_NL}</P>
      <Toggle value={consent} onChange={setConsent} title={t('flow.kids.consentTitle')} hint={t('flow.kids.consentHint')} />
      <Button title={t('flow.kids.make')} onPress={make} loading={busy} disabled={!consent} />
      {code && (
        <Notice kind="ok">{t('flow.kids.codeFor', { code, time: until })}</Notice>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      <P muted>{t('flow.kids.childSees')}</P>
      {(list ?? []).map((l) => (
        <Card key={l.linkId}>
          <P>{l.childName}</P>
          <P muted>{l.status === 'pending' ? t('flow.kids.waiting') : t('flow.kids.linked')}</P>
          {l.status === 'active' && (
            <Button title={t('flow.kids.open')} variant="secondary" onPress={() => router.push(`/ouder/${l.linkId}`)} />
          )}
          <Button title={t('flow.kids.revoke')} variant="secondary" onPress={() => { void revoke({ linkId: l.linkId }).catch((e) => setErr(errorNl(e))); }} />
        </Card>
      ))}
    </Screen>
  );
}
