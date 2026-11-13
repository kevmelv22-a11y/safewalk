import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { formatCallDuration, sanitizeCallerName } from '../src/lib/fakeCall';
import { startRinging, startVoice } from '../src/lib/fakeCallRunner';

/** Belscherm van de nep-oproep: inkomend → opgenomen (met timer) → opgehangen. Geen echte oproep. */
export default function FakeCallRing() {
  const p = useLocalSearchParams<{ caller?: string; voice?: string }>();
  const caller = sanitizeCallerName(p.caller);
  const withVoice = p.voice === '1';
  const [phase, setPhase] = useState<'ringing' | 'talking'>('ringing');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const ring = useRef<{ stop: () => void } | null>(null);
  const voice = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let alive = true;
    void startRinging().then((r) => { if (alive) ring.current = r; else r.stop(); });
    // Na 45 s zonder opnemen stopt het overgaan vanzelf (zoals een gemiste oproep).
    const giveUp = setTimeout(() => close(), 45_000);
    return () => { alive = false; clearTimeout(giveUp); ring.current?.stop(); voice.current?.stop(); };
  }, []);
  useEffect(() => {
    if (phase !== 'talking') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const answer = () => {
    ring.current?.stop(); ring.current = null;
    setStartedAt(Date.now()); setNow(Date.now()); setPhase('talking');
    if (withVoice) voice.current = startVoice();
  };
  function close() {
    ring.current?.stop(); voice.current?.stop();
    if (router.canGoBack()) router.back(); else router.replace('/');
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.top}>
        <Text style={s.sub}>{phase === 'ringing' ? 'Inkomende oproep' : formatCallDuration(now - startedAt)}</Text>
        <View style={s.avatar}><Text style={s.initial}>{caller.charAt(0).toUpperCase()}</Text></View>
        <Text style={s.name} numberOfLines={1}>{caller}</Text>
        <Text style={s.sub}>Mobiel</Text>
      </View>
      {phase === 'ringing' ? (
        <View style={s.row}>
          <CallButton label="Weigeren" color="#EF4444" glyph="✕" onPress={close} />
          <CallButton label="Opnemen" color="#22C55E" glyph="✆" onPress={answer} />
        </View>
      ) : (
        <View style={s.row}>
          <CallButton label="Ophangen" color="#EF4444" glyph="✕" onPress={close} />
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
