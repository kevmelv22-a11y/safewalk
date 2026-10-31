import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Screen, Button, Field, Notice, P, Card } from '../../src/components/ui';
import { useIsDark , palette } from '../../src/lib/theme';
import { darkMapStyle } from '../../src/lib/mapStyle';
import { etaLabel, formatDistance, haversineMeters, roughEtaMs } from '../../src/lib/safety';
import { useTripDraft, Destination } from '../../src/store/trip';

async function labelFor(lat: number, lng: number): Promise<string> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (r) return [r.street && `${r.street}${r.streetNumber ? ' ' + r.streetNumber : ''}`, r.city].filter(Boolean).join(', ') || 'Gekozen punt';
  } catch { /* geen netwerk of geen geocoder */ }
  return 'Gekozen punt';
}

export default function DestinationPicker() {
  const isDark = useIsDark();
  const setDestination = useTripDraft((s) => s.setDestination);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [pin, setPin] = useState<Destination | null>(useTripDraft.getState().destination);
  const [query, setQuery] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(async (p) => {
      if (p.status !== 'granted') return;
      const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}).catch(() => null));
      if (l) setMe({ lat: l.coords.latitude, lng: l.coords.longitude });
    });
  }, []);
  const choose = async (lat: number, lng: number, label?: string) => setPin({ lat, lng, label: label ?? (await labelFor(lat, lng)) });
  const search = async () => {
    setBusy(true); setErr(null);
    try {
      const [r] = await Location.geocodeAsync(query);
      if (!r) setErr('Adres niet gevonden. Probeer straat + plaats, of tik op de kaart.');
      else await choose(r.latitude, r.longitude, query.trim());
    } catch { setErr('Zoeken mislukt (geen netwerk?). Tik op de kaart om een punt te kiezen.'); }
    finally { setBusy(false); }
  };
  const center = pin ?? me ?? { lat: 52.37, lng: 4.9 };
  return (
    <Screen>
      <Field label="Zoek adres" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={search} placeholder="bv. Damstraat 1, Amsterdam" />
      <Button title="Zoeken" variant="secondary" onPress={search} loading={busy} disabled={!query.trim()} />
      {err && <Notice kind="warn">{err}</Notice>}
      <View style={{ height: 360, borderRadius: 16, overflow: 'hidden' }}>
        <MapView style={{ flex: 1 }} provider={PROVIDER_DEFAULT} customMapStyle={isDark ? darkMapStyle : []} userInterfaceStyle={isDark ? 'dark' : 'light'} showsUserLocation
          region={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
          onPress={(e) => choose(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} accessibilityLabel="Kaart: tik om bestemming te kiezen">
          {pin && <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} title={pin.label} pinColor={palette.purple} draggable
            onDragEnd={(e) => choose(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} />}
          {pin && me && <Polyline coordinates={[{ latitude: me.lat, longitude: me.lng }, { latitude: pin.lat, longitude: pin.lng }]} strokeColor={palette.purple} strokeWidth={3} lineDashPattern={[8, 6]} />}
        </MapView>
      </View>
      {pin && (
        <Card>
          <P>{pin.label}</P>
          {me && <P muted>{formatDistance(haversineMeters(me, pin))} hemelsbreed · {etaLabel(roughEtaMs(me, pin))}</P>}
          <P muted style={{ fontSize: 13 }}>De lijn is een rechte lijn, geen route. SafeWalk geeft geen advies over welke route veilig is.</P>
        </Card>
      )}
      <Button title="Gebruik deze bestemming" disabled={!pin} onPress={() => { setDestination(pin); router.back(); }} />
    </Screen>
  );
}
