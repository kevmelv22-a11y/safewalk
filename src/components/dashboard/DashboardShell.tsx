import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsDark } from '../../lib/theme';
import { dash, dashDark, dashLight } from './tokens';

/** Centered phone-width shell with subtle ambient depth (dashboard only). */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const dark = useIsDark();
  const t = dark ? dashDark : dashLight;
  const { width } = useWindowDimensions();
  const pad = width >= 900 ? 28 : 18;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: t.blobA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: t.blobB }]} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: pad, paddingBottom: 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', flexGrow: 1 },
  column: { width: '100%', maxWidth: dash.maxWidth, gap: 14 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobA: { width: 280, height: 280, top: -80, right: -90 },
  blobB: { width: 220, height: 220, top: 220, left: -110 },
});
