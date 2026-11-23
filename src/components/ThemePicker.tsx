import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';
import { listThemeSkins, ThemeSkinId } from '../lib/themeCatalog';
import { useThemePref, ThemePref } from '../store/theme';

const SKIN_KEYS: Record<ThemeSkinId, { name: string; desc: string }> = {
  classic: { name: 'themes.classic', desc: 'themes.classicDesc' },
  galaxy: { name: 'themes.galaxy', desc: 'themes.galaxyDesc' },
  halloween: { name: 'themes.halloween', desc: 'themes.halloweenDesc' },
  kerst: { name: 'themes.kerst', desc: 'themes.kerstDesc' },
  sinterklaas: { name: 'themes.sinterklaas', desc: 'themes.sinterklaasDesc' },
  noorderlicht: { name: 'themes.aurora', desc: 'themes.auroraDesc' },
  oceaan: { name: 'themes.ocean', desc: 'themes.oceanDesc' },
  zonsondergang: { name: 'themes.sunset', desc: 'themes.sunsetDesc' },
};

/** Light/dark/system + named skin cards with preview swatches. Persists via zustand/AsyncStorage. */
export function ThemePicker() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { pref, setPref, skin, setSkin } = useThemePref();
  const skins = listThemeSkins();

  return (
    <View style={{ gap: 14 }} testID="theme-picker">
      <Text style={[styles.section, { color: t.text }]}>{tr('themes.appearance')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['system', tr('themes.system')], ['dark', tr('themes.dark')], ['light', tr('themes.light')]] as [ThemePref, string][]).map(([k, l]) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: pref === k }}
            accessibilityLabel={`${tr('themes.appearance')} ${l}`}
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

      <Text style={[styles.section, { color: t.text }]}>{tr('themes.title')}</Text>
      <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' }}>
        {tr('themes.hint')}
      </Text>
      <View style={styles.grid}>
        {skins.map((s) => {
          const selected = skin === s.id;
          const name = tr(SKIN_KEYS[s.id].name);
          const desc = tr(SKIN_KEYS[s.id].desc);
          return (
            <Pressable
              key={s.id}
              testID={`theme-skin-${s.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${tr('themes.title')} ${name}`}
              accessibilityHint={desc}
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
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15, textAlign: 'left' }}>{name}</Text>
              <Text style={{ color: t.muted, fontSize: 12, lineHeight: 17, textAlign: 'left' }} numberOfLines={2}>{desc}</Text>
              {selected && (
                <Text
                  testID={`theme-skin-${s.id}-active`}
                  accessibilityLabel={`${name}`}
                  style={{ color: t.accent, fontWeight: '800', fontSize: 12, marginTop: 2, textAlign: 'left' }}
                >
                  {tr('themes.active', { name })}
                </Text>
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
