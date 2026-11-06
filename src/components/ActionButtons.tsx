import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconAlert, IconRush, IconSafe } from './dashboard/icons';
import { dash } from './dashboard/tokens';
import { CRITICAL_ACTIONS } from '../lib/themeCatalog';

type OneProps = {
  title: string;
  subtitle: string;
  color: string;
  deep: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID: string;
};

function BigAction({ title, subtitle, color, deep, icon, onPress, loading, disabled, testID }: OneProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: color,
          borderColor: 'rgba(255,255,255,0.22)',
          opacity: disabled ? 0.45 : pressed || loading ? 0.88 : 1,
          shadowColor: deep,
        },
      ]}
    >
      <View style={styles.iconBadge}>{icon}</View>
      <View style={styles.copy}>
        <Text style={styles.title}>{loading ? 'Bezig…' : title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
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
    <View style={styles.stack}>
      <BigAction
        testID="btn-unsafe"
        title="Ik voel me niet veilig"
        subtitle="Alarm + melding naar contacten · belt niet 112"
        color={CRITICAL_ACTIONS.red}
        deep='#B91C1C'
        icon={<IconAlert size={26} color="#fff" />}
        onPress={onUnsafe}
        loading={busy === 'unsafe'}
        disabled={disabled}
      />
      <BigAction
        testID="btn-come"
        title="Kom snel"
        subtitle="Waarschuwt contacten om naar je toe te komen"
        color={CRITICAL_ACTIONS.orange}
        deep='#C2410C'
        icon={<IconRush size={26} color="#fff" />}
        onPress={onComeQuick}
        loading={busy === 'come'}
        disabled={disabled}
      />
      <BigAction
        testID="btn-safe"
        title="Ik ben veilig aangekomen"
        subtitle="Alleen met je veiligheidscode · stopt alarm"
        color={CRITICAL_ACTIONS.green}
        deep='#15803D'
        icon={<IconSafe size={26} color="#fff" />}
        onPress={onSafe}
        loading={busy === 'safe'}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  btn: {
    minHeight: 96,
    borderRadius: dash.radiusLg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    elevation: 5,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 4 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { color: 'rgba(255,255,255,0.95)', fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
