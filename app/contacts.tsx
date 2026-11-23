import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { InvitePanel } from '../src/components/InvitePanel';
import { useContacts } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';
import { confirmAction, showError } from '../src/lib/confirm';

export default function Contacts() {
  const { t } = useTranslation();
  const data = useContacts();
  const removeM = useMutation(api.contacts.remove); const blockM = useMutation(api.contacts.block);
  const mine = data?.mine ?? []; const theirs = data?.theirs ?? [];
  const fail = (e: unknown) => showError(errorNl(e));
  const limit = data?.limit ?? 2;
  const remove = (id: Id<'trustedContacts'>, name: string) => confirmAction(
    t('flow.contacts.removeTitle'),
    t('flow.contacts.removeBody', { name }),
    t('flow.contacts.remove'),
    () => { removeM({ id }).catch(fail); },
  );
  const block = (userId: Id<'users'>, name: string) => confirmAction(
    t('flow.contacts.blockTitle'),
    t('flow.contacts.blockBody', { name }),
    t('flow.contacts.block'),
    () => { blockM({ userId }).catch(fail); },
  );
  const report = (userId: Id<'users'>, name: string) => router.push({ pathname: '/report', params: { userId, name } });
  return (
    <Screen>
      <H1>{t('flow.contacts.title')}</H1>
      <P muted>{limit <= 2 ? t('flow.contacts.countFree', { used: mine.length, limit }) : t('flow.contacts.count', { used: mine.length, limit })}</P>
      {mine.map((c) => (
        <Card key={c.id}><P>{c.name}</P><P muted>{t('flow.contacts.canWatch')}</P>
          <Button title={t('flow.contacts.remove')} variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title={t('flow.contacts.block')} variant="secondary" onPress={() => block(c.userId, c.name)} />
          <Button title={t('flow.contacts.report')} variant="secondary" onPress={() => report(c.userId, c.name)} /></Card>
      ))}
      {data === undefined && <ActivityIndicator accessibilityLabel={t('flow.contacts.loading')} />}
      {data && mine.length === 0 && <Notice kind="info">{t('flow.contacts.empty')}</Notice>}
      <InvitePanel />
      <H1>{t('flow.contacts.ofYou')}</H1>
      {data && theirs.length === 0 && <P muted>{t('flow.contacts.noneOfYou')}</P>}
      {theirs.map((c) => (
        <Card key={c.id}><P>{c.name}</P>
          <Button title={t('flow.contacts.stopBeing')} variant="secondary" onPress={() => remove(c.id, c.name)} />
          <Button title={t('flow.contacts.block')} variant="secondary" onPress={() => block(c.userId, c.name)} />
          <Button title={t('flow.contacts.report')} variant="secondary" onPress={() => report(c.userId, c.name)} /></Card>
      ))}
    </Screen>
  );
}
