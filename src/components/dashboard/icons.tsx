import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

export function IconAlert({ size = 28, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.2 2.8 19.2c-.3.6.1 1.3.8 1.3h16.8c.7 0 1.1-.7.8-1.3L12 3.2Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 9.2v5.2" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={12} cy={17.2} r={1.15} fill={color} />
    </Svg>
  );
}

export function IconCome({ size = 28, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M8.2 12.8 11.2 15.6 16.2 9.4" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Running / rush glyph for “Kom snel”. */
export function IconRush({ size = 28, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13.2 4.6a2 2 0 1 1-2.2 0" fill={color} />
      <Path d="M8.5 10.2c1.4-.8 2.6-1.1 4.1-.4l2.4 1.2 2.6-1.6M10 21l1.6-4.2 2.2 1.6L16.4 21M7.2 14.2l2.4-1.6 1.8 2.4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSafe({ size = 28, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.2 5.2 6v5.4c0 4.2 2.9 7.9 6.8 9 3.9-1.1 6.8-4.8 6.8-9V6L12 3.2Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M8.6 12.2 11.1 14.6 15.6 9.6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPin({ size = 22, color = '#2DD4BF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21s6.5-5.2 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.8 12 21 12 21Z" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={10.5} r={2.4} fill={color} />
    </Svg>
  );
}

export function IconPhone({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6.5} y={2.5} width={11} height={19} rx={2.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M10 18.5h4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconPeople({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={2.4} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={16} cy={9} r={2} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M4.5 17.5c.4-2.4 2.3-3.8 4.5-3.8s4.1 1.4 4.5 3.8M14 13.9c1.6-.2 3.1.8 3.6 2.6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconClock({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 8.2v4.2l2.8 1.6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconStar({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.6 14.4 9l5.8.5-4.4 3.8 1.3 5.6L12 15.8 6.9 18.9l1.3-5.6L3.8 9.5 9.6 9 12 3.6Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChat({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconGear({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSos({ size = 20, color = '#F8FAFC' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.2} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M8.2 12h7.6M12 8.2v7.6" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
