import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  answerRing, createRing, declineRing, formatCallDuration, hangUpRing, missRing, type RingState,
} from '../src/lib/fakeCall';
import { startRinging, startVoice } from '../src/lib/fakeCallRunner';
import { screenshotMode } from '../src/lib/screenshotMode';

/** Belscherm van de nep-oproep: inkomend → opgenomen (met timer) → opgehangen. Geen echte oproep. */
export default function FakeCallRing() {
  const p = useLocalSearchParams<{ caller?: string; voice?: string; number?: string; staat?: string }>();
  const withVoice = p.voice === '1';
  const frozen = screenshotMode ? p.staat : undefined;
  const [state, setState] = useState<RingState>(() => {
    const base = createRing(p.caller, p.number);
    return frozen === 'talking' ? answerRing(base, 1_000) : base;
  });
  const [now, setNow] = useState(frozen === 'talking' ? 8_000 : 0);

  useEffect(() => {
    if (state.phase !== 'ringing' || screenshotMode) return;
    let alive = true;
    let ringer: { stop: () => void } | null = null;
    void startRinging().then((r) => { if (alive) ringer = r; else r.stop(); });
    const giveUp = setTimeout(() => setState((s) => missRing(s)), 45_000);
    return () => { alive = false; clearTimeout(giveUp); ringer?.stop(); };
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'talking' || !withVoice || screenshotMode) return;
    const voice = startVoice();
    return () => voice.stop();
  }, [state.phase, withVoice]);

  useEffect(() => {
    if (state.phase !== 'talking' || screenshotMode) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'closed') return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [state.phase]);

  const subtitle = state.phase === 'talking' && state.startedAt !== null
    ? formatCallDuration(now - state.startedAt)
    : state.phase === 'closed' ? 'Oproep beëindigd' : 'Inkomende oproep';

  return (
    <SafeAreaView style={s.root}>
      <View style={s.top}>
        <Text style={s.sub}>{subtitle}</Text>
        <View style={s.avatar}><Text style={s.initial}>{state.caller.charAt(0).toUpperCase()}</Text></View>
        <Text style={s.name} numberOfLines={1}>{state.caller}</Text>
        <Text style={s.sub}>{state.number || 'Mobiel'}</Text>
      </View>
      {state.phase === 'ringing' ? (
        <View style={s.row}>
          <CallButton label="Weigeren" color="#EF4444" glyph="✕" onPress={() => setState((s) => declineRing(s))} />
          <CallButton label="Opnemen" color="#22C55E" glyph="✆" onPress={() => { const at = Date.now(); setNow(at); setState((s) => answerRing(s, at)); }} />
        </View>
      ) : state.phase === 'talking' ? (
        <View style={s.row}>
          <CallButton label="Ophangen" color="#EF4444" glyph="✕" onPress={() => setState((s) => hangUpRing(s))} />
        </View>
      ) : (
        <View style={s.row}>
          <CallButton label="Sluiten" color="#64748B" glyph="✕" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />
        </View>
      )}
    </SafeAreaView>
  );
}

function CallButton({ label, color, glyph, onPress }: { label: string; color: string; glyph: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: color, opacity: pressed ? 0.8 : 1 }]}>
        <Text style={s.glyph}>{glyph}</Text>
      </Pressable>
      <Text style={s.btnLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220', justifyContent: 'space-between', paddingVertical: 48 },
  top: { alignItems: 'center', gap: 10, marginTop: 40 },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  initial: { color: '#F8FAFC', fontSize: 48, fontWeight: '700' },
  name: { color: '#F8FAFC', fontSize: 34, fontWeight: '600', paddingHorizontal: 24 },
  sub: { color: '#CBD5E1', fontSize: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 40 },
  btn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: '#fff', fontSize: 32, fontWeight: '700' },
  btnLabel: { color: '#E2E8F0', fontSize: 15 },
});
