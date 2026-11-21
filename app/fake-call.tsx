import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Field, Notice } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { useProfile } from '../src/lib/queries';
import {
  callerNumberIssue, effectiveCaller, FAKE_CALL_DELAYS, fakeCallAllowed, FREE_CALLERS, MAX_CALLER_LENGTH, MAX_NUMBER_LENGTH, sanitizeCallerNumber,
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
  const [preset, setPreset] = useState<string>(FREE_CALLERS[0]);
  const [custom, setCustom] = useState('');
  const [numberRaw, setNumberRaw] = useState(initialNumber);
  const [voice, setVoice] = useState(false);
  const [scheduled, setScheduled] = useState<{ at: number; caller: string; notification: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const caller = effectiveCaller(premium && custom.trim() ? custom : preset, premium);
  const numberIssue = callerNumberIssue(numberRaw);
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
    } catch { setErr('Inplannen lukte niet. Probeer het opnieuw.'); }
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
      <H1>Nep-oproep</H1>
      <P>Laat je telefoon overgaan met een echt lijkend gesprek, zodat je makkelijker weg kunt uit een vervelende situatie. Er wordt niemand gebeld en er gaat niets naar je contacten.</P>

      <Card>
        <P>Wie belt er?</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{FREE_CALLERS.map(chip)}</View>
        {premium ? (
          <Field label="Of een eigen naam" value={custom} onChangeText={setCustom} maxLength={MAX_CALLER_LENGTH} placeholder="Bijv. Sam" />
        ) : (
          <P muted style={{ fontSize: 13 }}>Een eigen naam kiezen is Premium.</P>
        )}
        <Field label="Nummer op het scherm (optioneel)" value={numberRaw} onChangeText={setNumberRaw} maxLength={MAX_NUMBER_LENGTH} keyboardType="phone-pad" placeholder="Bijv. 06 12345678" />
        <P muted style={{ fontSize: 13 }}>Dit nummer wordt alleen getoond. SafeWalk belt het niet, ook niet als het op een echt nummer lijkt.</P>
        {numberIssue && <Notice kind="warn">{numberIssue}</Notice>}
      </Card>

      <Button title={`Laat ${caller} nu bellen`} variant="success" onPress={ringNow} />

      <Card>
        <P>Later laten bellen</P>
        <P muted style={{ fontSize: 14 }}>Plan de oproep en stop je telefoon weg. Op dit scherm kies je nu, over 10 seconden, over 1 minuut of over 5 minuten.</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FAKE_CALL_DELAYS.filter((d) => d.ms > 0).map((d) => (
            <View key={d.id} style={{ flexGrow: 1, minWidth: 150 }}>
              <Button title={d.label} variant="secondary" disabled={!fakeCallAllowed('schedule', premium)} onPress={() => { void schedule(d.ms); }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <P>Stem in het gesprek</P>
            <P muted style={{ fontSize: 13 }}>De Nederlandse computerstem van je telefoon zegt een paar zinnen, met pauzes zodat jij kunt antwoorden.</P>
          </View>
          <Switch value={useVoice} onValueChange={setVoice} disabled={!fakeCallAllowed('voice', premium)} accessibilityLabel="Stem in het gesprek" />
        </View>
        {!premium && (adult
          ? <Button title="Bekijk Premium" variant="secondary" onPress={() => router.push('/premium')} />
          : <P muted style={{ fontSize: 13 }}>Inplannen, een eigen naam en de stem zijn Premium. Premium kan pas vanaf 16 jaar. Meteen laten bellen werkt altijd, ook onder 16.</P>)}
      </Card>

      {scheduled && (
        <Notice kind="ok">
          {`${scheduled.caller} belt je om ${new Date(scheduled.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.`}
          {scheduled.notification ? '' : ' Meldingen staan uit of dit is de browser: de oproep komt alleen als SafeWalk open blijft.'}
        </Notice>
      )}
      {scheduled && <Button title="Ingeplande oproep annuleren" variant="secondary" onPress={() => { void cancel(); }} />}
      {err && <Notice kind="danger">{err}</Notice>}

      <Notice kind="info">Staat SafeWalk dicht of is je scherm vergrendeld? Dan krijg je een melding met beltoon; tik erop om het belscherm te openen. Een belscherm over het vergrendelscherm heen kan SafeWalk niet tonen. Bij gevaar: gebruik “Ik voel me niet veilig” of bel zelf 112.</Notice>
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
