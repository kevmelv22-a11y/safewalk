import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { IconPin } from './icons';
import { dash } from './tokens';

type Props = {
  sharing: boolean;
  destinationLabel?: string | null;
  alert?: boolean;
  contactCount: number;
};

/** Honest location-sharing status — never invents “protected” states. */
export function StatusPanel({ sharing, destinationLabel, alert, contactCount }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const tone = alert ? theme.red : sharing ? theme.accent : theme.muted;
  const title = alert
    ? t('dashboard.statusAlert')
    : sharing
      ? t('dashboard.statusSharing', { destination: destinationLabel ?? '…' })
      : t('dashboard.statusIdle');
  const body = alert
    ? t('dashboard.statusAlertBody')
    : sharing
      ? t('dashboard.statusSharingBody')
      : contactCount === 0
        ? t('dashboard.statusNoContacts')
        : t(contactCount === 1 ? 'dashboard.statusContactsOne' : 'dashboard.statusContactsOther', { count: contactCount });

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: alert ? 'rgba(239,68,68,0.45)' : theme.border,
        },
      ]}
    >
      <View style={[styles.dotWrap, { backgroundColor: alert ? 'rgba(239,68,68,0.18)' : theme.blobA }]}>
        <IconPin color={tone} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.muted }]}>{body}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: alert ? 'rgba(239,68,68,0.16)' : theme.blobA }]}>
        <Text style={[styles.pillText, { color: tone }]}>{sharing ? (alert ? t('dashboard.pillAlert') : t('dashboard.pillSharing')) : t('dashboard.pillIdle')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: dash.radiusLg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dotWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22, textAlign: 'left' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500', textAlign: 'left' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
});
