import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { IconChat, IconClock, IconGear, IconPeople, IconPhone, IconPin, IconSos, IconStar } from './icons';
import { dash } from './tokens';
import { useLocale } from '../../i18n/provider';
import { showsDutchHelplines } from '../../i18n/emergency';

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
  const theme = useTheme();
  const { t } = useTranslation();
  const { emergencyDigits, region } = useLocale();
  const icon = theme.text;
  const helpHint = showsDutchHelplines(region) ? t('nav.helpHintNl') : t('nav.helpHint', { number: emergencyDigits });

  const items: Item[] = [
    { key: 'live', label: t('nav.live'), hint: t('nav.liveHint'), onPress: onLiveNow, icon: <IconPin size={20} color={theme.accent} />, wide: true },
    { key: 'checkin', label: t('nav.checkin'), hint: t('nav.checkinHint'), onPress: onCheckIn, icon: <IconClock size={20} color={theme.accent} />, wide: true },
    { key: 'fakecall', label: t('nav.fake'), hint: t('nav.fakeHint'), onPress: onFakeCall, icon: <IconPhone size={20} color={theme.accent} />, wide: true },
    { key: '112', label: t('nav.emergency', { number: emergencyDigits }), hint: t('nav.emergencyHint'), onPress: onCall112, icon: <IconSos size={20} color={theme.red} />, wide: true },
    { key: 'help', label: t('nav.help'), hint: helpHint, onPress: onHulplijnen, icon: <IconPhone size={20} color={theme.red} />, wide: true },
    { key: 'places', label: t('nav.places'), hint: t('nav.placesHint'), onPress: onSafePlaces, icon: <IconPin size={20} color={theme.accent} />, wide: true },
    { key: 'contacts', label: t('nav.contacts'), onPress: onContacts, icon: <IconPeople size={20} color={icon} /> },
    { key: 'history', label: t('nav.history'), onPress: onHistory, icon: <IconClock size={20} color={icon} /> },
    { key: 'sos', label: t('nav.sos'), onPress: onSos, icon: <IconSos size={20} color={icon} /> },
    { key: 'assistant', label: t('nav.assistant'), onPress: onAssistant, icon: <IconChat size={20} color={icon} /> },
    { key: 'premium', label: t('nav.premium'), onPress: onPremium, icon: <IconStar size={20} color={icon} /> },
    { key: 'settings', label: t('nav.settings'), onPress: onSettings, icon: <IconGear size={20} color={icon} /> },
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
            { backgroundColor: theme.card, borderColor: theme.border, opacity: disabled ? 0.5 : pressed ? 0.86 : 1 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: theme.blobA }]}>{item.icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.text }]}>{item.label}</Text>
            {!!item.hint && <Text style={[styles.hint, { color: theme.muted }]}>{item.hint}</Text>}
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
              { backgroundColor: theme.card, borderColor: theme.border, opacity: disabled ? 0.5 : pressed ? 0.86 : 1 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.card }]}>{item.icon}</View>
            <Text style={[styles.cellLabel, { color: theme.text }]}>{item.label}</Text>
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
  label: { fontSize: 16, fontWeight: '700', textAlign: 'left' },
  hint: { fontSize: 14, lineHeight: 20, marginTop: 2, fontWeight: '500', textAlign: 'left' },
  cellLabel: { fontSize: 15, fontWeight: '700', textAlign: 'left' },
});
