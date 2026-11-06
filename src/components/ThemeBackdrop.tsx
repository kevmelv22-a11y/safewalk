import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import type { DecorationKind } from '../lib/themeCatalog';
import { SnapGalaxy } from './theme/SnapGalaxy';

/**
 * Full-bleed theme backdrop. Galaxy uses SnapShot X ChatGalaxy geometry.
 * Other skins use static motif scenes (no looping animation).
 */
export function ThemeBackdrop() {
  const t = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduceMotion(!!v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduceMotion(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {t.decoration === 'galaxy' ? (
        <SnapGalaxy sparse={reduceMotion} />
      ) : (
        <MotifScene kind={t.decoration} accent={t.accent} purple={t.purple} bg={t.bg} reduceMotion={reduceMotion} />
      )}
    </View>
  );
}

function MotifScene({
  kind, accent, purple, bg, reduceMotion,
}: { kind: DecorationKind; accent: string; purple: string; bg: string; reduceMotion: boolean }) {
  const { width, height } = useWindowDimensions();
  const sparse = reduceMotion;
  if (kind === 'none') {
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect width={width} height={height} fill={bg} />
        <Circle cx={width * 0.85} cy={height * 0.08} r={width * 0.35} fill={purple} opacity={0.12} />
        <Circle cx={width * 0.1} cy={height * 0.35} r={width * 0.28} fill={accent} opacity={0.1} />
      </Svg>
    );
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Rect width={width} height={height} fill={bg} />
      {kind === 'halloween' && (
        <>
          <Defs>
            <RadialGradient id="moon" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FDE68A" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.15" />
            </RadialGradient>
          </Defs>
          <Circle cx={width * 0.78} cy={height * 0.12} r={56} fill="url(#moon)" />
          <Circle cx={width * 0.74} cy={height * 0.1} r={50} fill={bg} opacity={0.55} />
          <Path d={`M${width * 0.12} ${height * 0.28} c 18 -40 60 -40 78 0 12 -28 42 -30 54 4 8 -18 28 -20 40 6 v 24 H ${width * 0.12} z`} fill={purple} opacity={0.45} />
          {!sparse && <Path d={`M${width * 0.55} ${height * 0.22} c 10 -22 32 -22 42 0 6 -14 20 -14 26 2 v 12 H ${width * 0.55} z`} fill={accent} opacity={0.28} />}
          <Path d={`M0 ${height * 0.78} Q ${width * 0.25} ${height * 0.7} ${width * 0.5} ${height * 0.8} T ${width} ${height * 0.74} V ${height} H 0 Z`} fill="#0B0608" opacity={0.55} />
        </>
      )}
      {kind === 'kerst' && (
        <>
          <Path d={`M${width * 0.18} ${height * 0.08} L${width * 0.26} ${height * 0.22} L${width * 0.1} ${height * 0.22} Z`} fill={purple} opacity={0.4} />
          <Path d={`M${width * 0.18} ${height * 0.16} L${width * 0.28} ${height * 0.34} L${width * 0.08} ${height * 0.34} Z`} fill={purple} opacity={0.32} />
          <Circle cx={width * 0.18} cy={height * 0.07} r={7} fill={accent} opacity={0.85} />
          {(sparse ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 7, 8]).map((i) => {
            const x = ((i * 97 + 40) % 100) / 100 * width;
            const y = ((i * 53 + 20) % 55) / 100 * height;
            return <Path key={i} d={`M${x} ${y} l3 7 7 1 -5 4 2 7 -7-4 -7 4 2-7 -5-4 7-1z`} fill="#F8FAFC" opacity={0.5} />;
          })}
          <Rect x={0} y={height * 0.82} width={width} height={height * 0.2} fill="#F8FAFC" opacity={0.08} />
        </>
      )}
      {kind === 'sinterklaas' && (
        <>
          <Rect x={width * 0.72} y={height * 0.1} width={64} height={50} rx={6} fill={purple} opacity={0.45} />
          <Rect x={width * 0.72 + 26} y={height * 0.1} width={12} height={50} fill={accent} opacity={0.7} />
          <Rect x={width * 0.72} y={height * 0.1 + 19} width={64} height={12} fill={accent} opacity={0.7} />
          <Path d={`M${width * 0.14} ${height * 0.08} c 28 -32 56 -10 40 26 L ${width * 0.2} ${height * 0.38}`} stroke={accent} strokeWidth={4} fill="none" opacity={0.55} />
          {!sparse && <Path d={`M${width * 0.42} ${height * 0.06} h70 l-12 20 h-46 z`} fill={purple} opacity={0.35} />}
          <Ellipse cx={width * 0.5} cy={height * 0.92} rx={width * 0.55} ry={height * 0.12} fill={purple} opacity={0.12} />
        </>
      )}
      {kind === 'aurora' && (
        <>
          <Defs>
            <LinearGradient id="aurora1" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={accent} stopOpacity="0" />
              <Stop offset="0.5" stopColor={accent} stopOpacity="0.35" />
              <Stop offset="1" stopColor={purple} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Path d={`M0 ${height * 0.18} C ${width * 0.2} ${height * 0.05} ${width * 0.4} ${height * 0.28} ${width * 0.6} ${height * 0.12} C ${width * 0.75} ${height * 0.02} ${width * 0.9} ${height * 0.2} ${width} ${height * 0.1} L ${width} 0 L 0 0 Z`} fill="url(#aurora1)" />
          <Path d={`M0 ${height * 0.28} C ${width * 0.25} ${height * 0.14} ${width * 0.45} ${height * 0.34} ${width * 0.7} ${height * 0.18} C ${width * 0.85} ${height * 0.1} ${width * 0.95} ${height * 0.26} ${width} ${height * 0.2} L ${width} 0 L 0 0 Z`} fill={purple} opacity={0.18} />
          {(sparse ? [0, 1] : [0, 1, 2, 3, 4, 5]).map((i) => (
            <Circle key={i} cx={((i * 61 + 12) % 100) / 100 * width} cy={((i * 37 + 8) % 40) / 100 * height} r={1.2} fill="#ECFEFF" opacity={0.5} />
          ))}
        </>
      )}
      {kind === 'ocean' && (
        <>
          <Defs>
            <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={bg} />
              <Stop offset="1" stopColor={purple} stopOpacity="0.35" />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill="url(#sea)" />
          <Path d={`M0 ${height * 0.72} C ${width * 0.15} ${height * 0.66} ${width * 0.3} ${height * 0.78} ${width * 0.5} ${height * 0.7} C ${width * 0.7} ${height * 0.64} ${width * 0.85} ${height * 0.76} ${width} ${height * 0.68} V ${height} H 0 Z`} fill={accent} opacity={0.28} />
          <Path d={`M0 ${height * 0.8} C ${width * 0.2} ${height * 0.74} ${width * 0.35} ${height * 0.86} ${width * 0.55} ${height * 0.78} C ${width * 0.75} ${height * 0.72} ${width * 0.9} ${height * 0.84} ${width} ${height * 0.76} V ${height} H 0 Z`} fill={purple} opacity={0.22} />
          {!sparse && <Circle cx={width * 0.8} cy={height * 0.16} r={36} fill="#FDE68A" opacity={0.25} />}
        </>
      )}
      {kind === 'sunset' && (
        <>
          <Defs>
            <RadialGradient id="sun" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={accent} stopOpacity="0.7" />
              <Stop offset="1" stopColor={purple} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={width * 0.7} cy={height * 0.2} r={width * 0.28} fill="url(#sun)" />
          <Ellipse cx={width * 0.5} cy={height * 0.32} rx={width * 0.5} ry={height * 0.08} fill={purple} opacity={0.2} />
          <Ellipse cx={width * 0.35} cy={height * 0.4} rx={width * 0.4} ry={height * 0.06} fill={accent} opacity={0.14} />
          <Path d={`M0 ${height * 0.55} L ${width} ${height * 0.48} V ${height} H 0 Z`} fill={purple} opacity={0.18} />
        </>
      )}
    </Svg>
  );
}
