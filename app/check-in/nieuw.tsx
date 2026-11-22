import { useState } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { CheckInAdultGate, HomeCheckInSetupView, previewSetupNow } from '../../src/components/HomeCheckInViews';
import { HomeCheckInBoundary } from '../../src/lib/homeCheckInKeeper';
import { useContacts } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { cleanLabel, defaultClock } from '../../src/lib/homeCheckIn';
import { getConsentedLocation } from '../../src/lib/locationOnce';
import { screenshotMode } from '../../src/lib/screenshotMode';
import { useNow } from '../../src/lib/useLiveLocations';
import { Notice, Screen, H1 } from '../../src/components/ui';

function PreviewSetup() {
  const [label, setLabel] = useState('Thuis');
  const [mode, setMode] = useState<'clock' | 'minutes'>('clock');
  const [hour, setHour] = useState(23);
  const [minute, setMinute] = useState(30);
  const [tomorrow, setTomorrow] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [selected, setSelected] = useState<string[]>(['voorbeeld']);
  return (
    <HomeCheckInSetupView
      now={previewSetupNow()} label={label} onLabel={setLabel} mode={mode} onMode={setMode}
      hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} tomorrow={tomorrow} onTomorrow={setTomorrow}
      minutes={minutes} onMinutes={setMinutes}
      contacts={[{ id: 'voorbeeld', name: 'Sam (voorbeeld)' }]} selected={selected}
      onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
      onSubmit={() => undefined}
    />
  );
}

function LiveSetup() {
  const start = useMutation(api.homeCheckIn.start);
  const contacts = useContacts()?.mine ?? [];
  const now = useNow(15_000);
  const initial = defaultClock(now);
  const [label, setLabel] = useState('Thuis');
  const [mode, setMode] = useState<'clock' | 'minutes'>('clock');
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [tomorrow, setTomorrow] = useState(initial.tomorrow);
  const [minutes, setMinutes] = useState(30);
  const [picked, setPicked] = useState<Id<'users'>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useTranslation();
  const selected = picked ?? contacts.map((c) => c.userId);
  const toggle = (id: string) => {
    const base = picked ?? contacts.map((c) => c.userId);
    setPicked(base.includes(id as Id<'users'>) ? base.filter((x) => x !== id) : [...base, id as Id<'users'>]);
  };
  const submit = async (dueAt: number) => {
    const name = cleanLabel(label);
    if (!name) return setErr(t('flow.home.needLabel'));
    if (selected.length === 0) return setErr(t('flow.home.noContacts'));
    setBusy(true); setErr(null);
    try {
      const loc = await getConsentedLocation();
      const id = await start({
        label: name, dueAt, viewerIds: selected,
        ...(loc.locationConsent ? { lat: loc.lat, lng: loc.lng, accuracyM: loc.accuracyM, locationAt: loc.locationAt } : {}),
      });
      router.replace(`/check-in/${id}`);
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };
  return (
    <CheckInAdultGate>
      <HomeCheckInSetupView
        now={now} label={label} onLabel={setLabel} mode={mode} onMode={setMode}
        hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} tomorrow={tomorrow} onTomorrow={setTomorrow}
        minutes={minutes} onMinutes={setMinutes}
        contacts={contacts.map((c) => ({ id: c.userId, name: c.name }))} selected={selected} onToggle={toggle}
        onSubmit={(dueAt) => { void submit(dueAt); }} busy={busy} error={err} web={Platform.OS === 'web'}
      />
    </CheckInAdultGate>
  );
}

export default function NewCheckIn() {
  const { t } = useTranslation();
  const preview = useLocalSearchParams<{ preview?: string }>().preview;
  if (screenshotMode && preview === '1') return <PreviewSetup />;
  return (
    <HomeCheckInBoundary fallback={<Screen><H1>{t('checkin.title')}</H1><Notice kind="warn">{t('flow.home.serverOff')}</Notice></Screen>}>
      <LiveSetup />
    </HomeCheckInBoundary>
  );
}
