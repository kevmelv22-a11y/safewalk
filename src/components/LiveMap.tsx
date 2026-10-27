import MapView, { Circle, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useColorScheme, View } from 'react-native';
import { palette } from '../lib/theme';
import { accuracyLabel, freshnessLabel, locationFreshness, timeAgo } from '../lib/safety';
import { Notice, P, Card } from './ui';

export type Loc = { lat: number; lng: number; accuracyM: number | null; recordedAt: number };
const darkStyle = [{ elementType: 'geometry', stylers: [{ color: '#0d1530' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#a5adc8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2648' }] }, { featureType: 'water', stylers: [{ color: '#080f23' }] }];

export function LiveMap({ trail, dest, now }: { trail: Loc[]; dest?: { lat: number; lng: number; label: string } | null; now: number }) {
  const scheme = useColorScheme();
  const last = trail[trail.length - 1];
  const f = locationFreshness(last?.recordedAt, now);
  const center = last ?? (dest ? { lat: dest.lat, lng: dest.lng } : { lat: 52.37, lng: 4.9 });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
        <MapView style={{ flex: 1 }} provider={PROVIDER_DEFAULT} customMapStyle={scheme === 'light' ? [] : darkStyle}
          region={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }} accessibilityLabel="Kaart met live locatie">
          {trail.length > 1 && <Polyline coordinates={trail.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={palette.purple} strokeWidth={4} />}
          {last && <Circle center={{ latitude: last.lat, longitude: last.lng }} radius={last.accuracyM ?? 0} fillColor="rgba(120,86,255,0.2)" strokeColor={palette.purple} />}
          {last && <Marker coordinate={{ latitude: last.lat, longitude: last.lng }} title="Laatste locatie" pinColor={f === 'fresh' ? palette.green : palette.red} />}
          {dest && <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title={dest.label} pinColor={palette.purple} />}
        </MapView>
      </View>
      <Card>
        <P>{freshnessLabel(f)}</P>
        <P muted>Laatste update: {timeAgo(last?.recordedAt, now)} · {accuracyLabel(last?.accuracyM)}</P>
      </Card>
      {(f === 'stale' || f === 'lost') && <Notice kind="warn">De locatie wordt niet meer ververst. Mogelijk staat GPS uit, is er geen internet of pauzeert de telefoon de app. De getoonde positie kan verouderd zijn.</Notice>}
      <P muted style={{ fontSize: 13 }}>De lijn toont de afgelegde route. SafeWalk geeft geen oordeel over de veiligheid van routes.</P>
    </View>
  );
}
