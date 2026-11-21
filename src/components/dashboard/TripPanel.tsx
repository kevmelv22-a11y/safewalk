import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
            {mine.status === 'alert' ? 'Check-in gemist' : isShare ? 'Jouw locatie delen' : 'Jouw actieve reis'}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>{isShare ? mine.destinationLabel : `Naar ${mine.destinationLabel}`}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {isShare
              ? (mine.shareUntilStop ? `Tot jij stopt, uiterlijk ${arrival} · nog ${countdown}` : `Tot ${arrival} · nog ${countdown}`)
              : `Verwachte aankomst ${arrival} · nog ${countdown}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sessie openen"
            onPress={onOpenMine}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.blobA, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: t.accent }]}>Sessie openen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.muted }]}>Reis</Text>
          <Text style={[styles.title, { color: t.text }]}>Geen actieve reis</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {contactCount === 0
              ? 'Nog geen vertrouwde contacten? Start dan een reis of timer met alleen een meekijklink, bijvoorbeeld via WhatsApp.'
              : 'Start een check-inreis zodat contacten je onderweg kunnen volgen.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Veilig naar huis – start reis"
            onPress={onStartTrip}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.green, opacity: pressed ? 0.88 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: '#fff' }]}>
              Veilig naar huis – start reis
            </Text>
          </Pressable>
          {!!onStartShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Locatie delen tot 24 uur"
              onPress={onStartShare}
              style={({ pressed }) => [styles.cta, { backgroundColor: t.blobA, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
            >
              <Text style={[styles.ctaText, { color: t.accent }]}>Locatie delen (1–24 uur)</Text>
            </Pressable>
          )}
        </View>
      )}

      {watching.map((s) => (
        <View key={s._id} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.accent }]}>Je volgt</Text>
          <Text style={[styles.title, { color: t.text }]}>{s.ownerName} → {s.destinationLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live kaart bekijken"
            onPress={() => onOpenWatch(s._id)}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: t.text }]}>Live kaart bekijken</Text>
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
