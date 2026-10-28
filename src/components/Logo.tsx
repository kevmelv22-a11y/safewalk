import { Image, useWindowDimensions } from 'react-native';

const RATIO = 900 / 1232; // breedte / hoogte van assets/logo-full.png (transparant)
/** Officieel SafeWalk-logo; schaalt mee met kleine en grote schermen. */
export function Logo({ size = 'large' }: { size?: 'large' | 'small' }) {
  const { width, height } = useWindowDimensions();
  const maxH = height * (size === 'large' ? 0.36 : 0.24);
  const w = Math.min(width * (size === 'large' ? 0.6 : 0.42), maxH * RATIO, size === 'large' ? 300 : 210);
  return <Image source={require('../../assets/logo-full.png')} accessibilityRole="image" accessibilityLabel="SafeWalk logo"
    style={{ width: w, height: w / RATIO, alignSelf: 'center' }} resizeMode="contain" />;
}
