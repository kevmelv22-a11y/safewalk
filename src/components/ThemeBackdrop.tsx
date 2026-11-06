import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import type { DecorationKind } from '../lib/themeCatalog';
import { SnapGalaxy } from './theme/SnapGalaxy';

/**
 * Full-bleed theme backdrop. Galaxy uses SnapShot X ChatGalaxy geometry.
 * Seasonal skins use calm night motifs (pumpkin/moon, evergreen/gold/snow, roof/gifts).
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

function Pumpkin({ cx, cy, s, body, stem }: { cx: number; cy: number; s: number; body: string; stem: string }) {
  return (
    <>
      <Ellipse cx={cx - s * 0.35} cy={cy} rx={s * 0.42} ry={s * 0.55} fill={body} opacity={0.92} />
      <Ellipse cx={cx + s * 0.35} cy={cy} rx={s * 0.42} ry={s * 0.55} fill={body} opacity={0.92} />
      <Ellipse cx={cx} cy={cy} rx={s * 0.5} ry={s * 0.58} fill={body} />
      <Path d={`M${cx - s * 0.08} ${cy - s * 0.55} q ${s * 0.08} ${-s * 0.35} ${s * 0.22} ${-s * 0.18}`} stroke={stem} strokeWidth={Math.max(2, s * 0.12)} fill="none" opacity={0.9} />
      <Path d={`M${cx - s * 0.18} ${cy - s * 0.08} l ${s * 0.12} ${s * 0.1} l ${-s * 0.12} ${s * 0.1} z`} fill="#1A0A08" opacity={0.55} />
      <Path d={`M${cx + s * 0.06} ${cy - s * 0.08} l ${s * 0.12} ${s * 0.1} l ${-s * 0.12} ${s * 0.1} z`} fill="#1A0A08" opacity={0.55} />
      <Path d={`M${cx - s * 0.14} ${cy + s * 0.22} q ${s * 0.14} ${s * 0.16} ${s * 0.28} 0`} stroke="#1A0A08" strokeWidth={Math.max(1.5, s * 0.08)} fill="none" opacity={0.5} />
    </>
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
              <Stop offset="0" stopColor="#FDE68A" stopOpacity="0.95" />
              <Stop offset="0.55" stopColor="#FBBF24" stopOpacity="0.45" />
              <Stop offset="1" stopColor="#EA580C" stopOpacity="0.05" />
            </RadialGradient>
          </Defs>
          <Circle cx={width * 0.78} cy={height * 0.11} r={62} fill="url(#moon)" />
          <Circle cx={width * 0.73} cy={height * 0.09} r={48} fill={bg} opacity={0.42} />
          <Path d={`M${width * 0.08} ${height * 0.3} c 22 -48 70 -48 90 0 14 -32 48 -34 62 6 10 -20 32 -22 46 8 v 28 H ${width * 0.08} z`} fill="#1A0F18" opacity={0.7} />
          {!sparse && <Path d={`M${width * 0.52} ${height * 0.24} c 12 -26 38 -26 50 0 8 -16 24 -16 30 4 v 14 H ${width * 0.52} z`} fill="#2A1520" opacity={0.5} />}
          <Path d={`M0 ${height * 0.76} Q ${width * 0.22} ${height * 0.68} ${width * 0.48} ${height * 0.78} T ${width} ${height * 0.72} V ${height} H 0 Z`} fill="#080406" opacity={0.75} />
          <Pumpkin cx={width * 0.18} cy={height * 0.82} s={38} body="#EA580C" stem="#4D7C0F" />
          {!sparse && <Pumpkin cx={width * 0.38} cy={height * 0.86} s={26} body="#C2410C" stem="#3F6212" />}
          <Pumpkin cx={width * 0.86} cy={height * 0.84} s={32} body="#F97316" stem="#4D7C0F" />
        </>
      )}
      {kind === 'kerst' && (
        <>
          <Defs>
            <RadialGradient id="goldGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FDE68A" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#EAB308" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          {/* Far evergreen */}
          <Path d={`M${width * 0.72} ${height * 0.42} L${width * 0.82} ${height * 0.62} L${width * 0.62} ${height * 0.62} Z`} fill="#14532D" opacity={0.55} />
          <Path d={`M${width * 0.72} ${height * 0.5} L${width * 0.84} ${height * 0.72} L${width * 0.6} ${height * 0.72} Z`} fill="#166534" opacity={0.5} />
          {/* Near evergreen */}
          <Path d={`M${width * 0.22} ${height * 0.28} L${width * 0.34} ${height * 0.5} L${width * 0.1} ${height * 0.5} Z`} fill="#14532D" opacity={0.75} />
          <Path d={`M${width * 0.22} ${height * 0.4} L${width * 0.38} ${height * 0.66} L${width * 0.06} ${height * 0.66} Z`} fill="#15803D" opacity={0.7} />
          <Path d={`M${width * 0.22} ${height * 0.54} L${width * 0.42} ${height * 0.82} L${width * 0.02} ${height * 0.82} Z`} fill="#166534" opacity={0.8} />
          <Rect x={width * 0.2} y={height * 0.82} width={width * 0.04} height={height * 0.06} fill="#3F2A14" opacity={0.85} />
          <Circle cx={width * 0.22} cy={height * 0.26} r={9} fill="url(#goldGlow)" />
          <Circle cx={width * 0.22} cy={height * 0.26} r={5} fill={accent} opacity={0.95} />
          {/* Gold ornaments */}
          <Circle cx={width * 0.16} cy={height * 0.48} r={4} fill={accent} opacity={0.85} />
          <Circle cx={width * 0.28} cy={height * 0.58} r={3.5} fill={accent} opacity={0.8} />
          {!sparse && <Circle cx={width * 0.18} cy={height * 0.7} r={4} fill="#FDE68A" opacity={0.75} />}
          {/* Soft snow */}
          {(sparse ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((i) => {
            const x = ((i * 97 + 40) % 100) / 100 * width;
            const y = ((i * 53 + 12) % 70) / 100 * height;
            return <Path key={i} d={`M${x} ${y} l2.2 5.2 5.2 0.8 -4 3.2 1.4 5.2 -4.8-3 -4.8 3 1.4-5.2 -4-3.2 5.2-0.8z`} fill="#F8FAFC" opacity={0.45 + (i % 3) * 0.08} />;
          })}
          <Path d={`M0 ${height * 0.88} Q ${width * 0.3} ${height * 0.84} ${width * 0.55} ${height * 0.9} T ${width} ${height * 0.86} V ${height} H 0 Z`} fill="#F8FAFC" opacity={0.12} />
        </>
      )}
      {kind === 'sinterklaas' && (
        <>
          {/* Roofline / city silhouette */}
          <Path
            d={`M0 ${height * 0.55}
              L ${width * 0.08} ${height * 0.55}
              L ${width * 0.12} ${height * 0.42}
              L ${width * 0.16} ${height * 0.55}
              L ${width * 0.28} ${height * 0.55}
              L ${width * 0.34} ${height * 0.38}
              L ${width * 0.4} ${height * 0.55}
              L ${width * 0.52} ${height * 0.55}
              L ${width * 0.58} ${height * 0.44}
              L ${width * 0.64} ${height * 0.55}
              L ${width * 0.78} ${height * 0.55}
              L ${width * 0.82} ${height * 0.4}
              L ${width * 0.88} ${height * 0.55}
              L ${width} ${height * 0.55}
              V ${height * 0.72} H 0 Z`}
            fill="#3B0A16"
            opacity={0.85}
          />
          <Path d={`M0 ${height * 0.7} H ${width} V ${height} H 0 Z`} fill="#1A080E" opacity={0.9} />
          {/* Warm window glows */}
          <Rect x={width * 0.3} y={height * 0.58} width={14} height={18} rx={2} fill={accent} opacity={0.55} />
          <Rect x={width * 0.55} y={height * 0.58} width={12} height={16} rx={2} fill={accent} opacity={0.4} />
          {!sparse && <Rect x={width * 0.14} y={height * 0.58} width={10} height={14} rx={2} fill="#FDE68A" opacity={0.35} />}
          {/* Gift boxes */}
          <Rect x={width * 0.7} y={height * 0.78} width={58} height={44} rx={5} fill={purple} opacity={0.9} />
          <Rect x={width * 0.7 + 23} y={height * 0.78} width={12} height={44} fill={accent} opacity={0.85} />
          <Rect x={width * 0.7} y={height * 0.78 + 16} width={58} height={12} fill={accent} opacity={0.85} />
          <Rect x={width * 0.12} y={height * 0.82} width={42} height={34} rx={4} fill="#9F1239" opacity={0.88} />
          <Rect x={width * 0.12 + 16} y={height * 0.82} width={10} height={34} fill={accent} opacity={0.8} />
          <Rect x={width * 0.12} y={height * 0.82 + 12} width={42} height={10} fill={accent} opacity={0.8} />
          {/* Soft mitre hint */}
          {!sparse && <Path d={`M${width * 0.48} ${height * 0.12} h56 l-10 18 h-36 z`} fill={purple} opacity={0.4} />}
          <Ellipse cx={width * 0.5} cy={height * 0.95} rx={width * 0.55} ry={height * 0.08} fill={purple} opacity={0.1} />
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
