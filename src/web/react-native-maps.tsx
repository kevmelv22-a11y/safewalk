// Web-vervanger voor react-native-maps (dat alleen native werkt). Toont een nette placeholder;
// locatie, afstand en ETA blijven via de tekstkaarten zichtbaar.
import React from 'react';
import { Text, View, type ViewProps } from 'react-native';

export const PROVIDER_DEFAULT = undefined;
export const PROVIDER_GOOGLE = 'google';
const Nothing = () => null;
export const Marker = Nothing; export const Polyline = Nothing; export const Circle = Nothing; export const Polygon = Nothing;
export default function MapView({ style }: ViewProps & Record<string, unknown>) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f2937', minHeight: 200 }, style]}>
      <Text style={{ color: '#e5e7eb' }}>Kaart is beschikbaar in de mobiele app</Text>
    </View>
  );
}
