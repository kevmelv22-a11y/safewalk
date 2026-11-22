import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

/** Compact SafeWalk brand header for the home dashboard. */
export function DashboardHeader() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Image
        source={require('../../../assets/logo-full.png')}
        accessibilityRole="image"
        accessibilityLabel="SafeWalk logo"
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.text }]}>SafeWalk</Text>
        <Text style={[styles.sub, { color: t.muted }]}>
          {tr('dashboard.tagline')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 2 },
  logo: { width: 64, height: 82 },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4, textAlign: 'left' },
  sub: { fontSize: 15, lineHeight: 22, fontWeight: '500', textAlign: 'left' },
});
