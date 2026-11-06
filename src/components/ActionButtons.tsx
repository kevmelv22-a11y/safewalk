import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { palette } from '../lib/theme';

type OneProps = {
  title: string; subtitle: string; color: string; onPress: () => void; loading?: boolean; disabled?: boolean; testID: string;
};

function BigAction({ title, subtitle, color, onPress, loading, disabled, testID }: OneProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 88, borderRadius: 20, backgroundColor: color, paddingVertical: 18, paddingHorizontal: 20,
        justifyContent: 'center', opacity: disabled ? 0.45 : pressed || loading ? 0.85 : 1,
        borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)', elevation: 4,
      })}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.2 }}>{loading ? 'Bezig…' : title}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 4, fontWeight: '600' }}>{subtitle}</Text>
    </Pressable>
  );
}

type Props = {
  onUnsafe: () => void;
  onComeQuick: () => void;
  onSafe: () => void;
  disabled?: boolean;
  busy?: 'unsafe' | 'come' | 'safe' | null;
};

/** Drie grote éénhands-knoppen (rood / oranje / groen) voor het beginscherm. */
export function ActionButtons({ onUnsafe, onComeQuick, onSafe, disabled, busy }: Props) {
  return (
    <View style={{ gap: 12 }}>
      <BigAction testID="btn-unsafe" title="Ik voel me niet veilig" subtitle="Alarm + melding naar contacten · belt niet 112"
        color={palette.red} onPress={onUnsafe} loading={busy === 'unsafe'} disabled={disabled} />
      <BigAction testID="btn-come" title="Kom snel" subtitle="Waarschuwt contacten om naar je toe te komen"
        color="#EA580C" onPress={onComeQuick} loading={busy === 'come'} disabled={disabled} />
      <BigAction testID="btn-safe" title="Ik ben veilig aangekomen" subtitle="Alleen met je veiligheids-PIN · stopt alarm"
        color={palette.green} onPress={onSafe} loading={busy === 'safe'} disabled={disabled} />
    </View>
  );
}
