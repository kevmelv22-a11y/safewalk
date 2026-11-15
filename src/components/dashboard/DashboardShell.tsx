import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { ThemeBackdrop } from '../ThemeBackdrop';
import { dash } from './tokens';
import { ConnectionBanner } from '../ConnectionBanner';

/** Centered phone-width shell; surfaces follow active app theme skin. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const pad = width >= 900 ? 28 : 18;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ThemeBackdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: pad, paddingBottom: 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}><ConnectionBanner />{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', flexGrow: 1 },
  column: { width: '100%', maxWidth: dash.maxWidth, gap: 14 },
});
