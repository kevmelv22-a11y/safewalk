import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { ThemeBackdrop } from './ThemeBackdrop';
import { ConnectionBanner } from './ConnectionBanner';

export function Screen({
  children, scroll = true, ambient = true, backgroundColor,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  ambient?: boolean;
  backgroundColor?: string;
}) {
  const t = useTheme();
  const bg = backgroundColor ?? t.bg;
  const inner = <View style={{ padding: 20, gap: 14 }}><ConnectionBanner />{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {ambient ? <ThemeBackdrop /> : null}
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
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
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

/** Resolved button chrome — never dims the whole control via opacity when disabled. */
export function resolveButtonChrome(
  t: { purple: string; field: string; red: string; green: string; border: string; text: string; muted: string },
  variant: ButtonVariant,
  disabled: boolean,
) {
  const bg = {
    primary: t.purple,
    secondary: t.field,
    danger: t.red,
    success: t.green,
  }[variant];
  const border = variant === 'secondary' ? t.border : bg;
  // Solid fills keep #FFFFFF labels (AA on purple/green; danger large-text OK). Secondary uses text/muted.
  const label = variant === 'secondary'
    ? (disabled ? t.muted : t.text)
    : '#FFFFFF';
  return { bg, border, label };
}

type BtnProps = { title: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; loading?: boolean; hint?: string };
export function Button({ title, onPress, variant = 'primary', disabled, loading, hint }: BtnProps) {
  const t = useTheme();
  const { bg, border, label } = resolveButtonChrome(t, variant, !!disabled);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, {
        backgroundColor: bg,
        borderColor: border,
        // Disabled: full opacity so labels stay readable; pressed only when interactive
        opacity: disabled || loading ? 1 : pressed ? 0.85 : 1,
      }]}>
      {loading ? <ActivityIndicator color={label} /> : <Text style={{ color: label, fontSize: 17, fontWeight: '700' }}>{title}</Text>}
    </Pressable>
  );
}
export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 14, fontWeight: '600' }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        placeholderTextColor={t.placeholder}
        {...props}
        style={{
          color: t.text,
          borderColor: t.border,
          borderWidth: 1.5,
          borderRadius: 12,
          padding: 14,
          fontSize: 17,
          backgroundColor: t.field,
        }}
      />
    </View>
  );
}
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const t = useTheme();
  const c = { info: t.purple, warn: t.amber, danger: t.red, ok: t.green }[kind];
  return (
    <View accessibilityRole="alert" style={{ borderLeftWidth: 4, borderLeftColor: c, backgroundColor: t.field, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}
export const Disclaimer = () => (
  <Notice kind="warn">SafeWalk is geen officiële hulpdienst. De app belt 112 niet automatisch en kan niet garanderen dat meldingen aankomen. Bel bij direct gevaar zelf 112.</Notice>
);
const s = StyleSheet.create({ btn: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1.5 } });
