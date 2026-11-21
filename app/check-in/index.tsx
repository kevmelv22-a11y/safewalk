import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, H1, Notice, P, Screen } from '../../src/components/ui';
import { CheckInAdultGate } from '../../src/components/HomeCheckInViews';
import { HomeCheckInBoundary } from '../../src/lib/homeCheckInKeeper';
import { formatCountdown } from '../../src/lib/safety';
import { HOME_MAX_ACTIVE, formatDue, statusLabel } from '../../src/lib/homeCheckIn';
import { useNow } from '../../src/lib/useLiveLocations';

function LiveList() {
  const data = useQuery(api.homeCheckIn.mine);
  const now = useNow(1000);
  const pending = data?.pending ?? [];
  const recent = data?.recent ?? [];
  return (
    <CheckInAdultGate>
      <Screen>
        <H1>Thuis-check-in</H1>
        <P>Zeg hoe laat je thuis denkt te zijn. Je kunt er meer dan één tegelijk hebben, hooguit {HOME_MAX_ACTIVE}. Een reis blijft daarnaast gewoon lopen.</P>
        <Button title="Nieuwe thuis-check-in" variant="success" disabled={pending.length >= HOME_MAX_ACTIVE} onPress={() => router.push('/check-in/nieuw')} />
        {pending.length >= HOME_MAX_ACTIVE && <Notice kind="warn">Je hebt al {HOME_MAX_ACTIVE} check-ins open. Rond er een af of annuleer er een.</Notice>}
        {data === undefined && <P muted>Laden…</P>}
        {data && pending.length === 0 && recent.length === 0 && <P muted>Geen thuis-check-in. Er gaat nu niemand een melding krijgen.</P>}
        {pending.map((c) => (
          <Card key={c._id}>
            <P>{c.label}</P>
            <P muted>Om {formatDue(c.dueAt, now)} · nog {formatCountdown(c.dueAt - now)}{c.locationKnown ? '' : ' · locatie nog onbekend'}</P>
            <Button title="Openen" onPress={() => router.push(`/check-in/${c._id}`)} />
          </Card>
        ))}
        {recent.map((c) => (
          <Card key={c._id}>
            <P>{c.label}</P>
            <P muted>{statusLabel(c.status)} · {formatDue(c.dueAt, now)}</P>
            <Button title="Bekijken" variant="secondary" onPress={() => router.push(`/check-in/${c._id}`)} />
          </Card>
        ))}
        <Notice kind="info">Dit helpt je contacten een seintje te geven. Het is geen vervanging voor 112.</Notice>
      </Screen>
    </CheckInAdultGate>
  );
}

export default function CheckInIndex() {
  return (
    <HomeCheckInBoundary fallback={<Screen><H1>Thuis-check-in</H1><Notice kind="warn">De thuis-check-in staat op deze server nog niet aan.</Notice></Screen>}>
      <LiveList />
    </HomeCheckInBoundary>
  );
}
