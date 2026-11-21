import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button, H1, Notice, P, Screen } from '../../src/components/ui';
import { CheckInAdultGate, HomeCheckInStatusView, previewStatus } from '../../src/components/HomeCheckInViews';
import { HomeCheckInBoundary } from '../../src/lib/homeCheckInKeeper';
import { errorNl } from '../../src/lib/convex';
import { screenshotMode } from '../../src/lib/screenshotMode';
import { useNow } from '../../src/lib/useLiveLocations';
import type { HomeStatus } from '../../src/lib/homeCheckIn';

function PreviewStatus() {
  const staat = useLocalSearchParams<{ staat?: string }>().staat;
  const sample = previewStatus(staat);
  return (
    <HomeCheckInStatusView
      label="Thuis" status={sample.status} dueAt={sample.dueAt} graceMinutes={2} extensions={0}
      now={sample.now} locationKnown={sample.locationKnown} locationAt={sample.locationAt}
      viewerNames={['Sam (voorbeeld)']} onHome={() => undefined} onExtend={() => undefined} onCancel={() => undefined}
    />
  );
}

function LiveStatus({ id }: { id: Id<'homeCheckIns'> }) {
  const data = useQuery(api.homeCheckIn.get, { id });
  const confirm = useMutation(api.homeCheckIn.confirm);
  const extend = useMutation(api.homeCheckIn.extend);
  const cancel = useMutation(api.homeCheckIn.cancel);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(errorNl(e)); } finally { setBusy(false); }
  };
  return (
    <CheckInAdultGate>
      {data === undefined ? <Screen><P muted>Laden…</P></Screen> : data === null ? (
        <Screen>
          <Notice kind="info">Deze thuis-check-in bestaat niet of is niet van jou.</Notice>
          <Button title="Naar het overzicht" variant="secondary" onPress={() => router.replace('/check-in')} />
        </Screen>
      ) : (
        <HomeCheckInStatusView
          label={data.label} status={data.status as HomeStatus} dueAt={data.dueAt} graceMinutes={data.graceMinutes}
          extensions={data.extensions} now={now} locationKnown={data.locationKnown} locationAt={data.locationAt}
          viewerNames={data.viewerNames.map((v) => v.name)}
          onHome={() => { void run(() => confirm({ id })); }}
          onExtend={(minutes) => { void run(() => extend({ id, minutes })); }}
          onCancel={() => { void run(async () => { await cancel({ id }); router.replace('/check-in'); }); }}
          busy={busy} error={err}
        />
      )}
    </CheckInAdultGate>
  );
}

export default function CheckInDetail() {
  const params = useLocalSearchParams<{ id: string; staat?: string }>();
  if (screenshotMode && params.id === 'voorbeeld') return <PreviewStatus />;
  return (
    <HomeCheckInBoundary fallback={<Screen><H1>Thuis-check-in</H1><Notice kind="warn">De thuis-check-in staat op deze server nog niet aan.</Notice></Screen>}>
      <LiveStatus id={params.id as Id<'homeCheckIns'>} />
    </HomeCheckInBoundary>
  );
}
