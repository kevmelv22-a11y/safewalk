import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../lib/theme';

/** Translucent card over immersive theme backdrops (login/signup/welcome). */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: t.isDark ? 'rgba(26,20,37,0.82)' : 'rgba(255,255,255,0.88)',
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
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
});
