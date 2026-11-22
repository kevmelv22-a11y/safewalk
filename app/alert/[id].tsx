import { useLocalSearchParams, router } from 'expo-router';
import { Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Screen, H1, P, Notice, Button, Card } from '../../src/components/ui';
import { DeliveryList } from '../../src/components/DeliveryList';
import { accuracyLabel, alertTitle, timeAgo } from '../../src/lib/safety';
import { useTranslation } from 'react-i18next';
import { EmergencyButton } from '../../src/components/EmergencyButton';
import { useLocale } from '../../src/i18n/provider';
import { deviceStatusHint, deviceStatusLine } from '../../convex/deviceStatus';

export default function AlertDetail() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const id = useLocalSearchParams<{ id: string }>().id as Id<'alerts'>;
  const data = useQuery(api.sos.get, { alertId: id });
  if (data === undefined) return <Screen><P muted>Melding laden…</P></Screen>;
  if (data === null) return (
    <Screen>
      <Notice kind="info">Deze melding bestaat niet meer of is niet voor jou bedoeld.</Notice>
      <Button title="Naar het startscherm" variant="secondary" onPress={() => router.replace('/dashboard')} />
    </Screen>
  );
  const a = data.alert;
  const head = alertTitle(a.kind, a.clientRef);
  return (
    <Screen>
      <H1>{head.title}</H1>
      {!data.isOwner && head.explain ? <P muted>{head.explain}</P> : null}
      {a.status === 'cancelled' && <Notice kind="ok">De afzender heeft aangegeven dat alles goed is (vals alarm).</Notice>}
      <Card>
        <P>Gemeld: {new Date(a._creationTime).toLocaleString('nl-NL')}</P>
        {a.lat !== undefined ? <>
          <P muted>Laatst bekende locatie ({timeAgo(a.locationAt)}) · {accuracyLabel(a.accuracyM)}</P>
          <Button title="Open in kaarten" variant="secondary" onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lng}`)} />
        </> : <P muted>Geen locatie beschikbaar.</P>}
        {a.kind === 'missed_check_in' && deviceStatusLine(a) ? <P muted>📱 {deviceStatusLine(a)}</P> : null}
        {a.kind === 'missed_check_in' && deviceStatusHint(a, a._creationTime) ? <P muted>{deviceStatusHint(a, a._creationTime)}</P> : null}
      </Card>
      {data.isOwner && <DeliveryList deliveries={data.deliveries} />}
      {a.sessionId && !data.isOwner && <Button title="Live kaart (indien nog gedeeld)" variant="secondary" onPress={() => router.push(`/watch/${a.sessionId}`)} />}
      <Notice kind="warn">{t('common.disclaimer', { number: emergencyDigits })}</Notice>
      <EmergencyButton />
    </Screen>
  );
}
