import MapView, { Circle, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { View } from 'react-native';
import { palette , useIsDark } from '../lib/theme';
import { accuracyLabel, etaLabel, formatDistance, freshnessLabel, haversineMeters, locationFreshness, roughEtaMs, timeAgo } from '../lib/safety';
import { darkMapStyle } from '../lib/mapStyle';
import { Notice, P, Card } from './ui';

export type Loc = { lat: number; lng: number; accuracyM: number | null; recordedAt: number };
export function LiveMap({ trail, dest, now }: { trail: Loc[]; dest?: { lat: number; lng: number; label: string } | null; now: number }) {
  const isDark = useIsDark();
  const last = trail[trail.length - 1];
  const f = locationFreshness(last?.recordedAt, now);
  const center = last ?? (dest ? { lat: dest.lat, lng: dest.lng } : { lat: 52.37, lng: 4.9 });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
        <MapView style={{ flex: 1 }} provider={PROVIDER_DEFAULT} customMapStyle={isDark ? darkMapStyle : []} userInterfaceStyle={isDark ? 'dark' : 'light'}
          region={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }} accessibilityLabel="Kaart met live locatie">
          {trail.length > 1 && <Polyline coordinates={trail.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={palette.purple} strokeWidth={4} />}
          {last && <Circle center={{ latitude: last.lat, longitude: last.lng }} radius={last.accuracyM ?? 0} fillColor="rgba(120,86,255,0.2)" strokeColor={palette.purple} />}
          {last && <Marker coordinate={{ latitude: last.lat, longitude: last.lng }} title="Laatste locatie" pinColor={f === 'fresh' ? palette.green : palette.red} />}
          {dest && last && <Polyline coordinates={[{ latitude: last.lat, longitude: last.lng }, { latitude: dest.lat, longitude: dest.lng }]} strokeColor="rgba(165,173,200,0.8)" strokeWidth={2} lineDashPattern={[6, 6]} />}
          {dest && <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title={dest.label} pinColor={palette.purple} />}
        </MapView>
      </View>
      <Card>
        <P>{freshnessLabel(f)}</P>
        <P muted>Laatste update: {timeAgo(last?.recordedAt, now)} · {accuracyLabel(last?.accuracyM)}</P>
        {dest && last && <P muted>Nog {formatDistance(haversineMeters(last, dest))} naar {dest.label} · {etaLabel(roughEtaMs(last, dest))}</P>}
      </Card>
      {(f === 'stale' || f === 'lost') && <Notice kind="warn">De locatie wordt niet meer ververst. Mogelijk staat GPS uit, is er geen internet of pauzeert de telefoon de app. De getoonde positie kan verouderd zijn.</Notice>}
      <P muted style={{ fontSize: 13 }}>Paarse lijn: afgelegde route. Stippellijn: hemelsbrede richting naar de bestemming (geen routeadvies). SafeWalk geeft geen oordeel over de veiligheid van routes.</P>
    </View>
  );
}
