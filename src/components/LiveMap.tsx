import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { mapsAvailable } from '../lib/mapsAvailability';
import { validCoords } from '../lib/coords';
import { palette, useIsDark } from '../lib/theme';
import { accuracyLabel, etaLabel, formatDistance, freshnessLabel, haversineMeters, locationFreshness, roughEtaMs, timeAgo } from '../lib/safety';
import { OSM_ATTRIBUTION } from '../lib/osmMap';
import { AppMap } from './AppMap';
import { Button, Notice, P, Card } from './ui';

export type Loc = { lat: number; lng: number; accuracyM: number | null; recordedAt: number };
export function LiveMap({ trail, dest, now }: { trail: Loc[]; dest?: { lat: number; lng: number; label: string } | null; now: number }) {
  const isDark = useIsDark();
  const [mapFailed, setMapFailed] = useState(false);
  const lastRaw = trail[trail.length - 1];
  const last = lastRaw && validCoords(lastRaw.lat, lastRaw.lng) ? lastRaw : undefined;
  const destSafe = dest && validCoords(dest.lat, dest.lng) ? dest : null;
  const f = locationFreshness(last?.recordedAt, now);
  const center = last ?? (destSafe ? { lat: destSafe.lat, lng: destSafe.lng } : { lat: 52.37, lng: 4.9 });
  const points = trail.filter((p) => validCoords(p.lat, p.lng));
  const showMap = mapsAvailable() && !mapFailed;
  return (
    <View style={{ gap: 10 }}>
      {!showMap ? (
        // Runtime failure (geen netwerk, oude build zonder WebView): geen kaart, wel een kaartlink.
        <Card>
          <P>Kaart niet beschikbaar in deze versie</P>
          {last
            ? <Button title="Laatste locatie openen in Google Maps" variant="secondary" onPress={() => { void Linking.openURL(`https://maps.google.com/?q=${last.lat.toFixed(6)},${last.lng.toFixed(6)}`); }} />
            : <P muted>Nog geen locatie ontvangen.</P>}
        </Card>
      ) : (
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
        <AppMap
          style={{ flex: 1 }}
          center={{ lat: center.lat, lng: center.lng }}
          latitudeDelta={0.02}
          dark={isDark}
          accessibilityLabel="Kaart met live locatie"
          onError={() => setMapFailed(true)}
          markers={[
            ...(last ? [{ id: 'me', lat: last.lat, lng: last.lng, title: 'Laatste locatie', color: f === 'fresh' ? palette.green : palette.red }] : []),
            ...(destSafe ? [{ id: 'dest', lat: destSafe.lat, lng: destSafe.lng, title: destSafe.label, color: palette.purple }] : []),
          ]}
          lines={[
            ...(points.length > 1 ? [{ id: 'trail', points: points.map((p) => ({ lat: p.lat, lng: p.lng })), color: palette.purple, width: 4 }] : []),
            ...(destSafe && last ? [{ id: 'destline', points: [{ lat: last.lat, lng: last.lng }, { lat: destSafe.lat, lng: destSafe.lng }], color: 'rgba(165,173,200,0.8)', width: 2, dashed: true }] : []),
          ]}
          circles={last && last.accuracyM ? [{ id: 'acc', lat: last.lat, lng: last.lng, radiusM: last.accuracyM, fillColor: 'rgba(120,86,255,0.2)', strokeColor: palette.purple }] : []}
        />
      </View>
      )}
      <Card>
        <P>{freshnessLabel(f)}</P>
        <P muted>Laatste update: {timeAgo(last?.recordedAt, now)} · {accuracyLabel(last?.accuracyM)}</P>
        {destSafe && last && <P muted>Nog {formatDistance(haversineMeters(last, destSafe))} naar {destSafe.label} · {etaLabel(roughEtaMs(last, destSafe))}</P>}
      </Card>
      {(f === 'stale' || f === 'lost') && <Notice kind="warn">De locatie wordt niet meer ververst. Mogelijk staat GPS uit, is er geen internet of pauzeert de telefoon de app. De getoonde positie kan verouderd zijn.</Notice>}
      <P muted style={{ fontSize: 13 }}>Paarse lijn: afgelegde route. Stippellijn: hemelsbrede richting naar de bestemming (geen routeadvies). SafeWalk geeft geen oordeel over de veiligheid van routes.{Platform.OS !== 'ios' ? ` ${OSM_ATTRIBUTION}` : ''}</P>
    </View>
  );
}
