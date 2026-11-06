import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsDark } from '../../lib/theme';
import { IconPin } from './icons';
import { dash, dashDark, dashLight } from './tokens';

type Props = {
  sharing: boolean;
  destinationLabel?: string | null;
  alert?: boolean;
  contactCount: number;
};

/** Honest location-sharing status — never invents “protected” states. */
export function StatusPanel({ sharing, destinationLabel, alert, contactCount }: Props) {
  const dark = useIsDark();
  const t = dark ? dashDark : dashLight;
  const tone = alert ? dash.red : sharing ? t.teal : t.muted;
  const title = alert
    ? 'Check-in gemist — contacten gewaarschuwd'
    : sharing
      ? `Actieve reis · ${destinationLabel ?? 'onderweg'}`
      : 'Locatie wordt niet actief gedeeld';
  const body = alert
    ? 'Open je sessie om te bevestigen of te stoppen.'
    : sharing
      ? 'Vertrouwde contacten kunnen je reis volgen tot je stopt of aankomt.'
      : contactCount === 0
        ? 'Nog geen vertrouwde contacten. Voeg er een toe voordat je een reis start.'
        : `${contactCount} vertrouwd contact${contactCount === 1 ? '' : 'en'} klaar · start een reis om te delen.`;

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.card,
        {
          backgroundColor: t.card,
          borderColor: alert ? 'rgba(239,68,68,0.45)' : sharing ? t.tealBorder : t.border,
        },
      ]}
    >
      <View style={[styles.dotWrap, { backgroundColor: alert ? 'rgba(239,68,68,0.18)' : t.tealDim }]}>
        <IconPin color={tone} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.body, { color: t.muted }]}>{body}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: alert ? 'rgba(239,68,68,0.16)' : t.tealDim }]}>
        <Text style={[styles.pillText, { color: tone }]}>{sharing ? (alert ? 'Alert' : 'Delen') : 'Rust'}</Text>
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
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
});
