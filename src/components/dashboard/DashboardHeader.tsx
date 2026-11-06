import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useIsDark } from '../../lib/theme';
import { dashDark, dashLight } from './tokens';

/** Compact SafeWalk brand header for the home dashboard. */
export function DashboardHeader() {
  const dark = useIsDark();
  const t = dark ? dashDark : dashLight;
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
          Samen veilig thuis · grote knoppen voor onderweg
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 2 },
  logo: { width: 64, height: 82 },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
