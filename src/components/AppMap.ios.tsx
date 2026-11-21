import MapView, { Circle, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { darkMapStyle } from '../lib/mapStyle';
import type { AppMapProps } from '../lib/osmMap';

/** iOS: Apple Maps, no API key. Never uses the Google provider. */
export function AppMap({
  style, center, latitudeDelta = 0.02, markers, lines, circles, userLocation, dark,
  onPress, onMarkerDragEnd, accessibilityLabel,
}: AppMapProps) {
  return (
    <MapView
      style={style ?? { flex: 1 }}
      provider={PROVIDER_DEFAULT}
      customMapStyle={dark ? darkMapStyle : []}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      showsUserLocation={Boolean(userLocation)}
      region={{ latitude: center.lat, longitude: center.lng, latitudeDelta, longitudeDelta: latitudeDelta }}
      onPress={onPress ? (e) => onPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {(lines ?? []).filter((l) => l.points.length > 1).map((l) => (
        <Polyline
          key={l.id}
          coordinates={l.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={l.color}
          strokeWidth={l.width}
          lineDashPattern={l.dashed ? [6, 6] : undefined}
        />
      ))}
      {(circles ?? []).filter((c) => c.radiusM > 0).map((c) => (
        <Circle key={c.id} center={{ latitude: c.lat, longitude: c.lng }} radius={c.radiusM} fillColor={c.fillColor} strokeColor={c.strokeColor} />
      ))}
      {(markers ?? []).map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.lat, longitude: m.lng }}
          title={m.title}
          pinColor={m.color}
          draggable={Boolean(m.draggable)}
          onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(m.id, { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined}
        />
      ))}
    </MapView>
  );
}
