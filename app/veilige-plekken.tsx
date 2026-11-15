import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { formatDistance } from '../src/lib/safety';
import {
  OVERPASS_URL, SAFE_PLACES_DISCLAIMER_NL, PLACE_KIND_NL, overpassQuery, parseOverpass, placeNavigateUrl,
  type NearbyPlace, type PlaceKind,
} from '../src/lib/safePlaces';

const KIND_ORDER: PlaceKind[] = ['police', 'hospital', 'clinic', 'pharmacy', 'supermarket', 'fuel'];

export default function VeiligePlekken() {
  const profile = useProfile();
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocked = profile && profile.ageStatus !== 'adult';

  const search = async () => {
    if (blocked) return setErr('Deze functie gebruikt je locatie en is beschikbaar vanaf 16 jaar.');
    setBusy(true); setErr(null); setPlaces(null);
    try {
      const loc = await getConsentedLocation();
      if (!loc.locationConsent || loc.lat === undefined || loc.lng === undefined) {
        setErr('Locatietoestemming is nodig om plekken in de buurt te zoeken. Er gaat niets naar SafeWalk; alleen naar OpenStreetMap.');
        return;
      }
      const body = overpassQuery(loc.lat, loc.lng);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(OVERPASS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('OVERPASS');
      const data = await res.json() as { elements?: [] };
      setPlaces(parseOverpass(data, { lat: loc.lat, lng: loc.lng }));
    } catch {
      setErr('Zoeken lukte niet (geen netwerk, of de OpenStreetMap-dienst is even druk). Probeer het later opnieuw.');
    } finally { setBusy(false); }
  };

  const openNav = (p: NearbyPlace) => {
    const url = placeNavigateUrl(p.lat, p.lng, Platform.OS);
    if (url) void Linking.openURL(url);
  };

  return (
    <Screen>
      <H1>Plekken in de buurt</H1>
      <Notice kind="info">{SAFE_PLACES_DISCLAIMER_NL}</Notice>
      {blocked && <Notice kind="warn">Zoeken met je locatie kan pas vanaf 16 jaar.</Notice>}
      <Button title="Zoek politie, ziekenhuis en open plekken" onPress={search} loading={busy} disabled={!!blocked} />
      <P muted>Je locatie gaat bij het zoeken naar de Overpass API van OpenStreetMap. SafeWalk slaat deze zoekopdracht niet op.</P>
      {err && <Notice kind="warn">{err}</Notice>}
      {places && places.length === 0 && <Notice kind="info">Geen plekken gevonden binnen ongeveer 2,5 km. Probeer een andere plek of zoek zelf in een kaart-app.</Notice>}
      {KIND_ORDER.map((kind) => {
        const group = (places ?? []).filter((p) => p.kind === kind);
        if (!group.length) return null;
        return (
          <Card key={kind}>
            <P>{PLACE_KIND_NL[kind]}</P>
            {group.map((p) => (
              <Card key={p.id}>
                <P>{p.name}</P>
                <P muted>{formatDistance(p.distanceM)}{p.maybeOpen24h ? ' · volgens OSM 24 uur open' : p.openingHours ? ` · openingstijden (OSM): ${p.openingHours}` : ' · openingstijden onbekend'}</P>
                <Button title="Navigeer" variant="secondary" onPress={() => openNav(p)} />
              </Card>
            ))}
          </Card>
        );
      })}
      <Button title="Hulplijnen" variant="secondary" onPress={() => router.push('/hulplijnen')} />
    </Screen>
  );
}
