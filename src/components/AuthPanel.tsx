import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../lib/theme';

/** Auth card using resolved theme surfaces (never light-wash on immersive skins). */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: t.card,
          borderColor: t.border,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
});
