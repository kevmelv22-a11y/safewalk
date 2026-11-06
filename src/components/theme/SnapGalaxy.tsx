import React from 'react';
import { useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Immersive galaxy — geometry from SnapShot X `components/ChatGalaxy.tsx`.
 * Stars a touch brighter than source so auth screens stay readable over nebula.
 */
const stars = Array.from({ length: 82 }, (_, i) => ({
  x: ((i * 73 + 17) % 101) / 100,
  y: ((i * 47 + 31) % 101) / 100,
  r: i % 7 === 0 ? 1.25 : 0.65,
  opacity: i % 5 === 0 ? 0.58 : 0.26,
}));

export function SnapGalaxy({ sparse = false }: { sparse?: boolean }) {
  const { width, height } = useWindowDimensions();
  const list = sparse ? stars.filter((_, i) => i % 3 === 0) : stars;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="swNight" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#21123C" />
          <Stop offset="0.4" stopColor="#111126" />
          <Stop offset="0.83" stopColor="#08090E" />
          <Stop offset="1" stopColor="#06070C" />
        </LinearGradient>
        <RadialGradient id="swNebula" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#8446BC" stopOpacity="0.36" />
          <Stop offset="1" stopColor="#52208F" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="swBlue" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#2B6FA9" stopOpacity="0.26" />
          <Stop offset="1" stopColor="#2B6FA9" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#swNight)" />
      <Ellipse cx={width * 0.67} cy={height * 0.19} rx={width * 0.62} ry={height * 0.3} fill="url(#swNebula)" />
      <Ellipse cx={width * 0.25} cy={height * 0.42} rx={width * 0.55} ry={height * 0.24} fill="url(#swBlue)" />
      {list.map((star, i) => (
        <Circle key={i} cx={star.x * width} cy={star.y * height * 0.82} r={star.r} fill="#E8D8FF" opacity={star.opacity} />
      ))}
    </Svg>
  );
}
