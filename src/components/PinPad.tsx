import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme, palette } from '../lib/theme';
import { Notice } from './ui';

type Props = {
  title: string;
  hint?: string;
  length?: number;
  error?: string | null;
  busy?: boolean;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
};

/** Grote numerieke PIN-pad (geen plaintext-log). */
export function PinPad({ title, hint, length = 6, error, busy, onSubmit, onCancel }: Props) {
  const t = useTheme();
  const [digits, setDigits] = useState('');
  const add = (d: string) => {
    if (busy) return;
    const next = (digits + d).slice(0, length);
    setDigits(next);
    if (next.length >= 4 && next.length === length) onSubmit(next);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>{title}</Text>
      {hint && <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>{hint}</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, minHeight: 28 }}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < digits.length ? t.text : t.border }} />
        ))}
      </View>
      {error && <Notice kind="danger">{error}</Notice>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {keys.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Wis' : k === 'OK' ? 'Bevestigen' : k}
            disabled={busy}
            onPress={() => {
              if (k === '⌫') setDigits((d) => d.slice(0, -1));
              else if (k === 'OK') { if (digits.length >= 4) onSubmit(digits); }
              else add(k);
            }}
            style={({ pressed }) => ({
              width: '30%', minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
              backgroundColor: k === 'OK' ? palette.purple : t.card, borderWidth: 1, borderColor: t.border,
              opacity: pressed || busy ? 0.7 : 1,
            })}>
            <Text style={{ color: k === 'OK' ? '#fff' : t.text, fontSize: 22, fontWeight: '800' }}>{k}</Text>
          </Pressable>
        ))}
      </View>
      {onCancel && (
        <Pressable accessibilityRole="button" accessibilityLabel="Annuleren" onPress={onCancel}>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 16, padding: 12 }}>Annuleren</Text>
        </Pressable>
      )}
    </View>
  );
}
