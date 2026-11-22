import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Card, Field, Notice } from '../src/components/ui';
import { useLocale } from '../src/i18n/provider';
import { useTheme } from '../src/lib/theme';
import { useProfile } from '../src/lib/queries';
import {
  callerNumberIssue, effectiveCaller, fakeCallAllowed, FREE_CALLERS, MAX_CALLER_LENGTH, MAX_NUMBER_LENGTH, sanitizeCallerNumber,
} from '../src/lib/fakeCall';
import { cancelFakeCall, scheduleFakeCall } from '../src/lib/fakeCallRunner';
import { screenshotMode } from '../src/lib/screenshotMode';

/**
 * Nep-oproep instellen. Gratis vanaf 13: meteen laten bellen door Mama, Papa of Huisgenoot, met een nummer dat alleen op het scherm staat.
 * Premium (16+): over 10 seconden, 1 minuut of 5 minuten, een eigen naam en een telefoonstem.
 * Er wordt nooit echt gebeld.
 */
function FakeCallForm({ premium, adult, initialNumber = '' }: { premium: boolean; adult: boolean; initialNumber?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { emergencyDigits } = useLocale();
  const presets = [tr('fake.mom'), tr('fake.dad'), tr('fake.housemate')];
  const [preset, setPreset] = useState<string>(FREE_CALLERS[0]);
  const [custom, setCustom] = useState('');
  const [numberRaw, setNumberRaw] = useState(initialNumber);
  const [voice, setVoice] = useState(false);
  const [scheduled, setScheduled] = useState<{ at: number; caller: string; notification: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chosen = presets.includes(preset) ? preset : presets[0];
  const caller = effectiveCaller(premium && custom.trim() ? custom : chosen, premium);
  const numberIssue = (() => {
    const issue = callerNumberIssue(numberRaw);
    if (!issue) return null;
    if (tr('fake.title') === 'Nep-oproep') return issue;
    const digits = numberRaw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 3) return tr('fake.numberShort');
    if (digits.length > 15) return tr('fake.numberLong');
    return tr('fake.numberEmergency');
  })();
  const number = numberIssue ? '' : sanitizeCallerNumber(numberRaw);
  const useVoice = voice && fakeCallAllowed('voice', premium);
  const params = { caller, voice: useVoice ? '1' : '0', number } as const;

  const ringNow = () => {
    if (numberIssue) return setErr(numberIssue);
    router.push({ pathname: '/fake-call-ring', params });
  };
  const schedule = async (delayMs: number) => {
    if (numberIssue) return setErr(numberIssue);
    if (!fakeCallAllowed('schedule', premium)) return;
    setErr(null);
    try {
      const r = await scheduleFakeCall({
        caller, number, voice: useVoice, delayMs,
        onDueInApp: () => router.push({ pathname: '/fake-call-ring', params }),
      });
      setScheduled({ at: r.at, caller, notification: r.notification });
    } catch { setErr(tr('fake.scheduleFailed')); }
  };
  const cancel = async () => { await cancelFakeCall(); setScheduled(null); };

  const chip = (name: string) => {
    const on = preset === name && !(premium && custom.trim());
    return (
      <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setPreset(name); setCustom(''); }}
        style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: on ? t.purple : t.border, backgroundColor: on ? t.purple : t.field }}>
        <Text style={{ color: on ? '#fff' : t.text, fontWeight: '700' }}>{name}</Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <H1>{tr('fake.title')}</H1>
      <P>{tr('fake.intro')}</P>

      <Card>
        <P>{tr('fake.who')}</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{presets.map(chip)}</View>
        {premium ? (
          <Field label={tr('fake.custom')} value={custom} onChangeText={setCustom} maxLength={MAX_CALLER_LENGTH} placeholder={tr('fake.customPh')} />
        ) : (
          <P muted style={{ fontSize: 13 }}>{tr('fake.customLocked')}</P>
        )}
        <Field label={tr('fake.number')} value={numberRaw} onChangeText={setNumberRaw} maxLength={MAX_NUMBER_LENGTH} keyboardType="phone-pad" placeholder={tr('fake.numberPh')} />
        <P muted style={{ fontSize: 13 }}>{tr('fake.numberHint')}</P>
        {numberIssue && <Notice kind="warn">{numberIssue}</Notice>}
      </Card>

      <Button title={tr('fake.callNow', { name: caller })} variant="success" onPress={ringNow} />

      <Card>
        <P>{tr('fake.later')}</P>
        <P muted style={{ fontSize: 14 }}>{tr('fake.laterHint')}</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([
            ['10s', tr('fake.delay10'), 10_000],
            ['1m', tr('fake.delay1'), 60_000],
            ['5m', tr('fake.delay5'), 5 * 60_000],
          ] as const).map(([id, label, ms]) => (
            <View key={id} style={{ flexGrow: 1, minWidth: 150 }}>
              <Button title={label} variant="secondary" disabled={!fakeCallAllowed('schedule', premium)} onPress={() => { void schedule(ms); }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <P>{tr('fake.voice')}</P>
            <P muted style={{ fontSize: 13 }}>{tr('fake.voiceHint')}</P>
          </View>
          <Switch value={useVoice} onValueChange={setVoice} disabled={!fakeCallAllowed('voice', premium)} accessibilityLabel={tr('fake.voice')} />
        </View>
        {!premium && (adult
          ? <Button title={tr('fake.seePremium')} variant="secondary" onPress={() => router.push('/premium')} />
          : <P muted style={{ fontSize: 13 }}>{tr('fake.premiumAge')}</P>)}
      </Card>

      {scheduled && (
        <Notice kind="ok">
          {tr('fake.scheduled', { name: scheduled.caller, time: new Date(scheduled.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })}
          {scheduled.notification ? '' : tr('fake.scheduledNoNotif')}
        </Notice>
      )}
      {scheduled && <Button title={tr('fake.cancel')} variant="secondary" onPress={() => { void cancel(); }} />}
      {err && <Notice kind="danger">{err}</Notice>}

      <Notice kind="info">{tr('fake.lockedNote', { number: emergencyDigits })}</Notice>
    </Screen>
  );
}

function LiveFakeCall() {
  const status = useQuery(api.billing.status);
  const profile = useProfile();
  return <FakeCallForm premium={!!status?.premium} adult={profile?.ageStatus === 'adult'} />;
}

export default function FakeCallSetup() {
  const preview = useLocalSearchParams<{ preview?: string }>().preview;
  if (screenshotMode && preview === '1') return <FakeCallForm premium adult initialNumber="06 12345678" />;
  return <LiveFakeCall />;
}
