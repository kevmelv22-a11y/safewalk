import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { Button, Card, H1, Notice, P, Screen } from '../../src/components/ui';
import { CheckInAdultGate } from '../../src/components/HomeCheckInViews';
import { HomeCheckInBoundary } from '../../src/lib/homeCheckInKeeper';
import { formatCountdown } from '../../src/lib/safety';
import { HOME_MAX_ACTIVE, formatDue } from '../../src/lib/homeCheckIn';
import { useNow } from '../../src/lib/useLiveLocations';
import { useLocale } from '../../src/i18n/provider';

function LiveList() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const data = useQuery(api.homeCheckIn.mine);
  const now = useNow(1000);
  const pending = data?.pending ?? [];
  const recent = data?.recent ?? [];
  return (
    <CheckInAdultGate>
      <Screen>
        <H1>{t('checkin.title')}</H1>
        <P>{t('flow.home.listIntro', { max: HOME_MAX_ACTIVE })}</P>
        <Button title={t('flow.home.newBtn')} variant="success" disabled={pending.length >= HOME_MAX_ACTIVE} onPress={() => router.push('/check-in/nieuw')} />
        {pending.length >= HOME_MAX_ACTIVE && <Notice kind="warn">{t('flow.home.maxOpen', { max: HOME_MAX_ACTIVE })}</Notice>}
        {data === undefined && <P muted>{t('flow.home.loading')}</P>}
        {data && pending.length === 0 && recent.length === 0 && <P muted>{t('flow.home.empty')}</P>}
        {pending.map((c) => (
          <Card key={c._id}>
            <P>{c.label}</P>
            <P muted>{t('flow.home.when', { time: formatDue(c.dueAt, now), left: formatCountdown(c.dueAt - now) })}{c.locationKnown ? '' : t('flow.home.unknown')}</P>
            <Button title={t('flow.home.open')} onPress={() => router.push(`/check-in/${c._id}`)} />
          </Card>
        ))}
        {recent.map((c) => (
          <Card key={c._id}>
            <P>{c.label}</P>
            <P muted>{(c.status === 'confirmed' ? t('checkin.confirmedTitle') : c.status === 'cancelled' ? t('checkin.cancelledTitle') : c.status === 'missed' ? t('checkin.missedTitle') : t('checkin.runningTitle'))} · {formatDue(c.dueAt, now)}</P>
            <Button title={t('flow.home.view')} variant="secondary" onPress={() => router.push(`/check-in/${c._id}`)} />
          </Card>
        ))}
        <Notice kind="info">{t('flow.home.not112', { number: emergencyDigits })}</Notice>
      </Screen>
    </CheckInAdultGate>
  );
}

export default function CheckInIndex() {
  const { t } = useTranslation();
  return (
    <HomeCheckInBoundary fallback={<Screen><H1>{t('checkin.title')}</H1><Notice kind="warn">{t('flow.home.serverOff')}</Notice></Screen>}>
      <LiveList />
    </HomeCheckInBoundary>
  );
}
