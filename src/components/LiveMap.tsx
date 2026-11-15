import MapView, { Circle, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Linking, View } from 'react-native';
import { mapsAvailable } from '../lib/mapsAvailability';
import { validCoords } from '../lib/coords';
import { palette , useIsDark } from '../lib/theme';
import { accuracyLabel, etaLabel, formatDistance, freshnessLabel, haversineMeters, locationFreshness, roughEtaMs, timeAgo } from '../lib/safety';
import { darkMapStyle } from '../lib/mapStyle';
import { Button, Notice, P, Card } from './ui';

export type Loc = { lat: number; lng: number; accuracyM: number | null; recordedAt: number };
export function LiveMap({ trail, dest, now }: { trail: Loc[]; dest?: { lat: number; lng: number; label: string } | null; now: number }) {
  const isDark = useIsDark();
  const lastRaw = trail[trail.length - 1];
  const last = lastRaw && validCoords(lastRaw.lat, lastRaw.lng) ? lastRaw : undefined;
  const destSafe = dest && validCoords(dest.lat, dest.lng) ? dest : null;
  const f = locationFreshness(last?.recordedAt, now);
  const center = last ?? (destSafe ? { lat: destSafe.lat, lng: destSafe.lng } : { lat: 52.37, lng: 4.9 });
  return (
    <View style={{ gap: 10 }}>
      {!mapsAvailable() ? (
        // Android zonder Google Maps-sleutel: MapView zou de app laten crashen. Dan geen kaart, wel een kaartlink.
        <Card>
          <P>Kaart niet beschikbaar in deze versie</P>
          {last
            ? <Button title="Laatste locatie openen in Google Maps" variant="secondary" onPress={() => { void Linking.openURL(`https://maps.google.com/?q=${last.lat.toFixed(6)},${last.lng.toFixed(6)}`); }} />
            : <P muted>Nog geen locatie ontvangen.</P>}
        </Card>
      ) : (
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
        <MapView style={{ flex: 1 }} provider={PROVIDER_DEFAULT} customMapStyle={isDark ? darkMapStyle : []} userInterfaceStyle={isDark ? 'dark' : 'light'}
          region={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }} accessibilityLabel="Kaart met live locatie">
          {trail.filter((p) => validCoords(p.lat, p.lng)).length > 1 && <Polyline coordinates={trail.filter((p) => validCoords(p.lat, p.lng)).map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={palette.purple} strokeWidth={4} />}
          {last && <Circle center={{ latitude: last.lat, longitude: last.lng }} radius={last.accuracyM ?? 0} fillColor="rgba(120,86,255,0.2)" strokeColor={palette.purple} />}
          {last && <Marker coordinate={{ latitude: last.lat, longitude: last.lng }} title="Laatste locatie" pinColor={f === 'fresh' ? palette.green : palette.red} />}
          {destSafe && last && <Polyline coordinates={[{ latitude: last.lat, longitude: last.lng }, { latitude: destSafe.lat, longitude: destSafe.lng }]} strokeColor="rgba(165,173,200,0.8)" strokeWidth={2} lineDashPattern={[6, 6]} />}
          {destSafe && <Marker coordinate={{ latitude: destSafe.lat, longitude: destSafe.lng }} title={destSafe.label} pinColor={palette.purple} />}
        </MapView>
      </View>
      )}
      <Card>
        <P>{freshnessLabel(f)}</P>
        <P muted>Laatste update: {timeAgo(last?.recordedAt, now)} · {accuracyLabel(last?.accuracyM)}</P>
        {destSafe && last && <P muted>Nog {formatDistance(haversineMeters(last, destSafe))} naar {destSafe.label} · {etaLabel(roughEtaMs(last, destSafe))}</P>}
      </Card>
      {(f === 'stale' || f === 'lost') && <Notice kind="warn">De locatie wordt niet meer ververst. Mogelijk staat GPS uit, is er geen internet of pauzeert de telefoon de app. De getoonde positie kan verouderd zijn.</Notice>}
      <P muted style={{ fontSize: 13 }}>Paarse lijn: afgelegde route. Stippellijn: hemelsbrede richting naar de bestemming (geen routeadvies). SafeWalk geeft geen oordeel over de veiligheid van routes.</P>
    </View>
  );
}
