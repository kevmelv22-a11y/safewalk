import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { dash } from './tokens';

type Mine = {
  _id: string;
  status: string;
  destinationLabel: string;
  expectedArrival: number;
  kind?: string;
  shareUntilStop?: boolean;
};

type Watching = {
  _id: string;
  ownerName: string;
  destinationLabel: string;
};

type Props = {
  mine?: Mine | null;
  watching: Watching[];
  contactCount: number;
  countdown: string;
  onOpenMine: () => void;
  onStartTrip: () => void;
  onStartShare?: () => void;
  onOpenWatch: (id: string) => void;
};

export function TripPanel({
  mine, watching, contactCount, countdown, onOpenMine, onStartTrip, onStartShare, onOpenWatch,
}: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const arrival = mine
    ? new Date(mine.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null;
  const isShare = mine?.kind === 'share';

  return (
    <View style={{ gap: 10 }}>
      {mine ? (
        <View style={[styles.card, {
          backgroundColor: t.card,
          borderColor: mine.status === 'alert' ? 'rgba(239,68,68,0.5)' : t.border,
        }]}>
          <Text style={[styles.kicker, { color: mine.status === 'alert' ? t.red : t.accent }]}>
            {mine.status === 'alert' ? tr('trip.missed') : isShare ? tr('trip.yourShare') : tr('trip.yourTrip')}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>{isShare ? mine.destinationLabel : tr('trip.toPlace', { destination: mine.destinationLabel })}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {isShare
              ? (mine.shareUntilStop ? tr('trip.untilYouStop', { time: arrival, countdown }) : tr('trip.untilTime', { time: arrival, countdown }))
              : tr('trip.expected', { time: arrival, countdown })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('trip.openSession')}
            onPress={onOpenMine}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.blobA, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: t.accent }]}>{tr('trip.openSession')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.muted }]}>{tr('trip.tripKicker')}</Text>
          <Text style={[styles.title, { color: t.text }]}>{tr('trip.none')}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {contactCount === 0 ? tr('trip.noneNoContacts') : tr('trip.noneHasContacts')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('flow.tripx.startHome')}
            onPress={onStartTrip}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.green, opacity: pressed ? 0.88 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: '#fff' }]}>
              {tr('flow.tripx.startHome')}
            </Text>
          </Pressable>
          {!!onStartShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('flow.tripx.share24')}
              onPress={onStartShare}
              style={({ pressed }) => [styles.cta, { backgroundColor: t.blobA, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
            >
              <Text style={[styles.ctaText, { color: t.accent }]}>{tr('flow.tripx.share24')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {watching.map((s) => (
        <View key={s._id} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.accent }]}>{tr('flow.tripx.watching')}</Text>
          <Text style={[styles.title, { color: t.text }]}>{s.ownerName} → {s.destinationLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('flow.tripx.watchLive')}
            onPress={() => onOpenWatch(s._id)}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: t.text }]}>{tr('flow.tripx.watchLive')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: dash.radiusLg, padding: 16, gap: 8 },
  kicker: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  meta: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  cta: { marginTop: 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ctaText: { fontSize: 16, fontWeight: '800' },
});
