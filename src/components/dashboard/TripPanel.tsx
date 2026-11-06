import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsDark } from '../../lib/theme';
import { dash, dashDark, dashLight } from './tokens';

type Mine = {
  _id: string;
  status: string;
  destinationLabel: string;
  expectedArrival: number;
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
  onOpenWatch: (id: string) => void;
};

export function TripPanel({
  mine, watching, contactCount, countdown, onOpenMine, onStartTrip, onOpenWatch,
}: Props) {
  const dark = useIsDark();
  const t = dark ? dashDark : dashLight;
  const arrival = mine
    ? new Date(mine.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={{ gap: 10 }}>
      {mine ? (
        <View style={[styles.card, {
          backgroundColor: t.card,
          borderColor: mine.status === 'alert' ? 'rgba(239,68,68,0.5)' : t.tealBorder,
        }]}>
          <Text style={[styles.kicker, { color: mine.status === 'alert' ? dash.red : t.teal }]}>
            {mine.status === 'alert' ? 'Check-in gemist' : 'Jouw actieve reis'}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>Naar {mine.destinationLabel}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            Verwachte aankomst {arrival} · nog {countdown}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sessie openen"
            onPress={onOpenMine}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.tealDim, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
          >
            <Text style={[styles.ctaText, { color: t.teal }]}>Sessie openen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.muted }]}>Reis</Text>
          <Text style={[styles.title, { color: t.text }]}>Geen actieve reis</Text>
          <Text style={[styles.meta, { color: t.muted }]}>
            {contactCount === 0
              ? 'Voeg eerst een vertrouwd contact toe om je reis te kunnen delen.'
              : 'Start een check-inreis zodat contacten je onderweg kunnen volgen.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Veilig naar huis – start reis"
            accessibilityState={{ disabled: contactCount === 0 }}
            disabled={contactCount === 0}
            onPress={onStartTrip}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: contactCount === 0 ? t.elevated : dash.green,
                opacity: contactCount === 0 ? 0.55 : pressed ? 0.88 : 1,
                minHeight: dash.touch,
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: contactCount === 0 ? t.muted : '#fff' }]}>
              Veilig naar huis – start reis
            </Text>
          </Pressable>
        </View>
      )}

      {watching.map((s) => (
        <View key={s._id} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.teal }]}>Je volgt</Text>
          <Text style={[styles.title, { color: t.text }]}>{s.ownerName} → {s.destinationLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live kaart bekijken"
            onPress={() => onOpenWatch(s._id)}
            style={({ pressed }) => [styles.cta, { backgroundColor: t.elevated, borderColor: t.border, borderWidth: 1, opacity: pressed ? 0.85 : 1, minHeight: dash.touch }]}
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
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  meta: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  cta: { marginTop: 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ctaText: { fontSize: 15, fontWeight: '800' },
});
