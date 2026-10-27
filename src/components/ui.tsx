import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const inner = <View style={{ padding: 20, gap: 14 }}>{children}</View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}</SafeAreaView>;
}
export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme(); return <Text accessibilityRole="header" style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{children}</Text>;
}
export function P({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme(); return <Text style={[{ color: muted ? t.muted : t.text, fontSize: 16, lineHeight: 23 }, style]}>{children}</Text>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme(); return <View style={[{ backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }, style]}>{children}</View>;
}
type BtnProps = { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'success'; disabled?: boolean; loading?: boolean; hint?: string };
export function Button({ title, onPress, variant = 'primary', disabled, loading, hint }: BtnProps) {
  const t = useTheme();
  const bg = { primary: t.purple, secondary: 'transparent', danger: t.red, success: t.green }[variant];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: variant === 'secondary' ? t.border : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: variant === 'secondary' ? t.text : '#fff', fontSize: 17, fontWeight: '700' }}>{title}</Text>}
    </Pressable>
  );
}
export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 14 }}>{props.label}</Text>
      <TextInput accessibilityLabel={props.label} placeholderTextColor={t.muted} {...props}
        style={{ color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17, backgroundColor: t.card }} />
    </View>
  );
}
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const t = useTheme();
  const c = { info: t.purple, warn: t.amber, danger: t.red, ok: t.green }[kind];
  return <View accessibilityRole="alert" style={{ borderLeftWidth: 4, borderLeftColor: c, backgroundColor: t.card, padding: 12, borderRadius: 10 }}><Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{children}</Text></View>;
}
export const Disclaimer = () => (
  <Notice kind="warn">SafeWalk is geen officiële hulpdienst. De app belt 112 niet automatisch en kan niet garanderen dat meldingen aankomen. Bel bij direct gevaar zelf 112.</Notice>
);
const s = StyleSheet.create({ btn: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1 } });
