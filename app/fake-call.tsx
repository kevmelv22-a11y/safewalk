import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Field, Notice } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { useProfile } from '../src/lib/queries';
import { effectiveCaller, fakeCallAllowed, FREE_CALLERS, MAX_CALLER_LENGTH, SCHEDULE_DELAYS_MIN } from '../src/lib/fakeCall';
import { cancelFakeCall, scheduleFakeCall } from '../src/lib/fakeCallRunner';

/**
 * Nep-oproep instellen. Gratis voor iedereen vanaf 13 jaar: meteen laten bellen door Mama, Papa of Huisgenoot.
 * Premium (16+): later laten bellen, een eigen naam en een telefoonstem in het gesprek.
 */
export default function FakeCallSetup() {
  const t = useTheme();
  const status = useQuery(api.billing.status);
  const profile = useProfile();
  const premium = !!status?.premium;
  const adult = profile?.ageStatus === 'adult';
  const [preset, setPreset] = useState<string>(FREE_CALLERS[0]);
  const [custom, setCustom] = useState('');
  const [voice, setVoice] = useState(false);
  const [scheduled, setScheduled] = useState<{ at: number; caller: string; notification: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const caller = effectiveCaller(premium && custom.trim() ? custom : preset, premium);
  const useVoice = voice && fakeCallAllowed('voice', premium);
  const params = { caller, voice: useVoice ? '1' : '0' } as const;

  const ringNow = () => router.push({ pathname: '/fake-call-ring', params });
  const schedule = async (min: number) => {
    setErr(null);
    try {
      const r = await scheduleFakeCall({ caller, voice: useVoice, delayMin: min, onDueInApp: () => router.push({ pathname: '/fake-call-ring', params }) });
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
      <P>Laat je telefoon overgaan met een echt lijkend gesprek, zodat je makkelijk weg kunt uit een vervelende situatie. Er wordt niemand echt gebeld en er gaat niets naar je contacten.</P>

      <Card>
        <P>Wie belt er?</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{FREE_CALLERS.map(chip)}</View>
        {premium ? (
          <Field label="Of een eigen naam" value={custom} onChangeText={setCustom} maxLength={MAX_CALLER_LENGTH} placeholder="Bijv. Sam" />
        ) : (
          <P muted style={{ fontSize: 13 }}>★ Een eigen naam kiezen is Premium.</P>
        )}
      </Card>

      <Button title={`📞 Laat ${caller} nu bellen`} variant="success" onPress={ringNow} />

      <Card>
        <P>★ Later laten bellen</P>
        <P muted style={{ fontSize: 14 }}>Handig als je alvast weet dat je weg wilt: plan de oproep en stop je telefoon weg.</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SCHEDULE_DELAYS_MIN.map((m) => (
            <View key={m} style={{ flexGrow: 1, minWidth: 140 }}>
              <Button title={`Over ${m} min`} variant="secondary" disabled={!fakeCallAllowed('schedule', premium)} onPress={() => schedule(m)} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <P>★ Stem in het gesprek</P>
            <P muted style={{ fontSize: 13 }}>De Nederlandse computerstem van je telefoon zegt een paar zinnen, met pauzes zodat jij kunt antwoorden.</P>
          </View>
          <Switch value={useVoice} onValueChange={setVoice} disabled={!fakeCallAllowed('voice', premium)} accessibilityLabel="Stem in het gesprek" />
        </View>
        {!premium && (adult
          ? <Button title="Bekijk Premium" variant="secondary" onPress={() => router.push('/premium')} />
          : <P muted style={{ fontSize: 13 }}>Inplannen, een eigen naam en de stem zijn Premium. Premium kan pas vanaf 16 jaar. Meteen laten bellen werkt altijd gratis.</P>)}
      </Card>

      {scheduled && (
        <Notice kind="ok">
          {`${scheduled.caller} belt je om ${new Date(scheduled.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.`}
          {scheduled.notification ? '' : ' Meldingen staan uit: de oproep komt alleen als SafeWalk open blijft.'}
        </Notice>
      )}
      {scheduled && <Button title="Ingeplande oproep annuleren" variant="secondary" onPress={cancel} />}
      {err && <Notice kind="danger">{err}</Notice>}

      <Notice kind="info">Staat SafeWalk dicht of is je scherm vergrendeld? Dan krijg je een melding met beltoon; tik erop om het belscherm te openen. Een belscherm over het vergrendelscherm heen kan SafeWalk niet tonen. Bij gevaar: gebruik “Ik voel me niet veilig” of bel 112.</Notice>
    </Screen>
  );
}
