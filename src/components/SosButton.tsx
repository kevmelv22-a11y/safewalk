import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { palette } from '../lib/theme';

export function SosButton({ sessionId }: { sessionId?: string | null }) {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ alignSelf: 'center', transform: [{ scale: pulse }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="SOS" accessibilityHint="Start een aftelling. Daarna worden je vertrouwde contacten gewaarschuwd. Je kunt annuleren."
        onPress={() => router.push({ pathname: '/sos', params: sessionId ? { sessionId } : {} })}
        style={({ pressed }) => ({ width: 200, height: 200, borderRadius: 100, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center',
          opacity: pressed ? 0.85 : 1, borderWidth: 8, borderColor: 'rgba(239,68,68,0.35)', elevation: 8 })}>
        <Text style={{ color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 2 }}>SOS</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>Tik voor hulp</Text>
      </Pressable>
    </Animated.View>
  );
}
