import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import type { DecorationKind } from '../lib/themeCatalog';

/**
 * Static ambient decoration for the active skin.
 * Non-interactive, hidden from accessibility, no looping animations (battery-safe).
 * Respects Reduce Motion by omitting denser shapes.
 */
export function ThemeBackdrop() {
  const t = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduceMotion(!!v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduceMotion(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  if (t.decoration === 'none') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.blob, styles.a, { backgroundColor: t.blobA }]} />
        <View style={[styles.blob, styles.b, { backgroundColor: t.blobB }]} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={[styles.blob, styles.a, { backgroundColor: t.blobA }]} />
      <View style={[styles.blob, styles.b, { backgroundColor: t.blobB }]} />
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <Decoration kind={t.decoration} accent={t.accent} purple={t.purple} reduceMotion={reduceMotion} />
      </Svg>
    </View>
  );
}

function Decoration({
  kind, accent, purple, reduceMotion,
}: { kind: DecorationKind; accent: string; purple: string; reduceMotion: boolean }) {
  const sparse = reduceMotion;
  switch (kind) {
    case 'galaxy':
      return (
        <>
          <Ellipse cx="320" cy="90" rx="90" ry="50" fill={purple} opacity={0.18} />
          <Ellipse cx="60" cy="220" rx="70" ry="40" fill={accent} opacity={0.12} />
          {(sparse ? [[40, 80], [200, 140], [300, 60]] : [[40, 80], [90, 160], [140, 50], [200, 140], [250, 100], [300, 60], [330, 200], [180, 240], [70, 300], [280, 280]]).map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.4} fill="#F8FAFC" opacity={0.55} />
          ))}
        </>
      );
    case 'halloween':
      return (
        <>
          <Circle cx="310" cy="88" r="34" fill="#FDE68A" opacity={0.55} />
          <Circle cx="298" cy="80" r="34" fill="#1A0F14" opacity={0.35} />
          {!sparse && (
            <Path d="M48 210c12-28 40-28 52 0 8-20 28-22 36 2 6-14 20-16 28 4v18H48z" fill={purple} opacity={0.35} />
          )}
        </>
      );
    case 'kerst':
      return (
        <>
          <Path d="M70 40 L95 110 L45 110 Z" fill={purple} opacity={0.28} />
          <Path d="M70 70 L100 150 L40 150 Z" fill={purple} opacity={0.22} />
          <Circle cx="70" cy="36" r="5" fill={accent} opacity={0.7} />
          {(sparse ? [[160, 70], [260, 110]] : [[160, 70], [200, 120], [260, 90], [300, 150], [220, 180], [120, 160]]).map(([x, y], i) => (
            <Path key={i} d={`M${x} ${y} l2 5 5 1 -4 3 1 5 -4-3 -4 3 1-5 -4-3 5-1z`} fill="#F8FAFC" opacity={0.45} />
          ))}
        </>
      );
    case 'sinterklaas':
      return (
        <>
          {/* gift box */}
          <Rect x="300" y="70" width="44" height="36" rx="4" fill={purple} opacity={0.35} />
          <Rect x="318" y="70" width="8" height="36" fill={accent} opacity={0.55} />
          <Rect x="300" y="84" width="44" height="8" fill={accent} opacity={0.55} />
          {/* staff */}
          <Path d="M48 60 c20 -24 40 -8 28 18 L60 200" stroke={accent} strokeWidth="3" fill="none" opacity={0.45} />
          {!sparse && <Path d="M210 40 h50 l-8 14 h-34z" fill={purple} opacity={0.3} />}
        </>
      );
    case 'aurora':
      return (
        <>
          <Path d="M0 120 C80 60 140 160 220 90 C280 40 340 130 390 80 L390 0 L0 0 Z" fill={accent} opacity={0.16} />
          <Path d="M0 180 C100 110 180 200 280 130 C330 100 360 160 390 130 L390 0 L0 0 Z" fill={purple} opacity={0.12} />
        </>
      );
    case 'ocean':
      return (
        <>
          <Path d="M0 700 C60 670 120 730 180 700 C240 670 300 730 390 690 L390 844 L0 844 Z" fill={accent} opacity={0.18} />
          <Path d="M0 740 C70 710 130 770 200 740 C270 710 330 770 390 735 L390 844 L0 844 Z" fill={purple} opacity={0.14} />
        </>
      );
    case 'sunset':
      return (
        <>
          <Circle cx="300" cy="100" r="42" fill={accent} opacity={0.35} />
          <Ellipse cx="200" cy="140" rx="160" ry="36" fill={purple} opacity={0.14} />
          <Ellipse cx="120" cy="180" rx="120" ry="28" fill={accent} opacity={0.1} />
        </>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 999 },
  a: { width: 280, height: 280, top: -80, right: -90 },
  b: { width: 220, height: 220, top: 220, left: -110 },
});
