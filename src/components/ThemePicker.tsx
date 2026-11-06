import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { listThemeSkins, ThemeSkinId } from '../lib/themeCatalog';
import { useThemePref, ThemePref } from '../store/theme';

/** Light/dark/system + named skin cards with preview swatches. Persists via zustand/AsyncStorage. */
export function ThemePicker() {
  const t = useTheme();
  const { pref, setPref, skin, setSkin } = useThemePref();
  const skins = listThemeSkins();

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.section, { color: t.text }]}>Weergave</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['system', 'Systeem'], ['dark', 'Donker'], ['light', 'Licht']] as [ThemePref, string][]).map(([k, l]) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: pref === k }}
            accessibilityLabel={`Weergave ${l}`}
            onPress={() => setPref(k)}
            style={({ pressed }) => [
              styles.toneBtn,
              {
                flex: 1,
                backgroundColor: pref === k ? t.purple : 'transparent',
                borderColor: pref === k ? t.purple : t.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: pref === k ? '#fff' : t.text, fontWeight: '700', fontSize: 15 }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.section, { color: t.text }]}>Thema</Text>
      <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
        Kies een sfeer. Galaxy en feestdagen zijn immersief donker (zoals SnapShot X). Klassiek volgt licht/donker. Veiligheidsknoppen blijven rood/oranje/groen.
      </Text>
      <View style={styles.grid}>
        {skins.map((s) => {
          const selected = skin === s.id;
          return (
            <Pressable
              key={s.id}
              testID={`theme-skin-${s.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Thema ${s.label}`}
              accessibilityHint={s.description}
              onPress={() => setSkin(s.id as ThemeSkinId)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: t.card,
                  borderColor: selected ? t.accent : t.border,
                  borderWidth: selected ? 2 : 1,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={styles.swatches}>
                {s.swatches.map((c) => (
                  <View key={c} style={[styles.swatch, { backgroundColor: c, borderColor: t.border }]} />
                ))}
              </View>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }}>{s.label}</Text>
              <Text style={{ color: t.muted, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{s.description}</Text>
              {selected && (
                <Text style={{ color: t.accent, fontWeight: '800', fontSize: 12, marginTop: 2 }}>Actief</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 16, fontWeight: '800' },
  toneBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: 16,
    padding: 12,
    gap: 6,
    minHeight: 118,
  },
  swatches: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  swatch: { width: 22, height: 22, borderRadius: 8, borderWidth: 1 },
});
