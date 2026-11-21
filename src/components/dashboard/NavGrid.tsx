import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';
import { IconChat, IconClock, IconGear, IconPeople, IconPhone, IconPin, IconSos, IconStar } from './icons';
import { dash } from './tokens';
import { QUICK_LOCATION } from '../../content/quickLocation';

type Item = {
  key: string;
  label: string;
  hint?: string;
  onPress: () => void;
  icon: React.ReactNode;
  wide?: boolean;
};

type Props = {
  onLiveNow: () => void;
  onCall112: () => void;
  onContacts: () => void;
  onHistory: () => void;
  onSos: () => void;
  onAssistant: () => void;
  onPremium: () => void;
  onSettings: () => void;
  onFakeCall: () => void;
  onCheckIn: () => void;
  onHulplijnen: () => void;
  onSafePlaces: () => void;
  disabled?: boolean;
};

export function NavGrid({
  onLiveNow, onCall112, onContacts, onHistory, onSos, onAssistant, onPremium, onSettings, onFakeCall, onCheckIn, onHulplijnen, onSafePlaces, disabled,
}: Props) {
  const t = useTheme();
  const icon = t.text;

  const items: Item[] = [
    { key: 'live', label: QUICK_LOCATION.title, hint: QUICK_LOCATION.hint, onPress: onLiveNow, icon: <IconPin size={20} color={t.accent} />, wide: true },
    { key: 'checkin', label: 'Thuis-check-in', hint: 'Ik ben om een bepaalde tijd thuis. Zo niet, dan een seintje naar je contacten', onPress: onCheckIn, icon: <IconClock size={20} color={t.accent} />, wide: true },
    { key: 'fakecall', label: 'Nep-oproep', hint: 'Laat je telefoon overgaan om weg te komen uit een vervelende situatie', onPress: onFakeCall, icon: <IconPhone size={20} color={t.accent} />, wide: true },
    { key: '112', label: 'Open 112 in de telefoon-app', hint: 'Je bevestigt zelf; SafeWalk belt niet automatisch', onPress: onCall112, icon: <IconSos size={20} color={t.red} />, wide: true },
    { key: 'help', label: 'Hulplijnen', hint: '112, politie 0900-8844 en Veilig Thuis 0800-2000', onPress: onHulplijnen, icon: <IconPhone size={20} color={t.red} />, wide: true },
    { key: 'places', label: 'Plekken in de buurt', hint: 'Politie, ziekenhuis en open plekken op de kaart', onPress: onSafePlaces, icon: <IconPin size={20} color={t.accent} />, wide: true },
    { key: 'contacts', label: 'Contacten', onPress: onContacts, icon: <IconPeople size={20} color={icon} /> },
    { key: 'history', label: 'Geschiedenis', onPress: onHistory, icon: <IconClock size={20} color={icon} /> },
    { key: 'sos', label: 'Klassieke SOS', onPress: onSos, icon: <IconSos size={20} color={icon} /> },
    { key: 'assistant', label: 'Assistent', onPress: onAssistant, icon: <IconChat size={20} color={icon} /> },
    { key: 'premium', label: 'Premium', onPress: onPremium, icon: <IconStar size={20} color={icon} /> },
    { key: 'settings', label: 'Instellingen', onPress: onSettings, icon: <IconGear size={20} color={icon} /> },
  ];

  const wide = items.filter((i) => i.wide);
  const grid = items.filter((i) => !i.wide);

  return (
    <View style={styles.wrap}>
      {wide.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityHint={item.hint}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.wide,
            { backgroundColor: t.card, borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.86 : 1 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: t.blobA }]}>{item.icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: t.text }]}>{item.label}</Text>
            {!!item.hint && <Text style={[styles.hint, { color: t.muted }]}>{item.hint}</Text>}
          </View>
        </Pressable>
      ))}
      <View style={styles.grid}>
        {grid.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            disabled={disabled}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: t.card, borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.86 : 1 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: t.card }]}>{item.icon}</View>
            <Text style={[styles.cellLabel, { color: t.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  wide: {
    minHeight: dash.touch,
    borderRadius: dash.radiusMd,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: '47.8%',
    flexGrow: 1,
    minHeight: 88,
    borderRadius: dash.radiusMd,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 14, lineHeight: 20, marginTop: 2, fontWeight: '500' },
  cellLabel: { fontSize: 15, fontWeight: '700' },
});
