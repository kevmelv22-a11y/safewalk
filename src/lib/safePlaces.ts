import { navigationLinks } from '../../convex/liveShare';
import { validCoords } from './coords';

/** Publieke Overpass-endpoint (gratis, geen sleutel). Alleen aanroepen na een tik van de gebruiker. */
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_RADIUS_M = 2500;

export type PlaceKind = 'police' | 'hospital' | 'clinic' | 'pharmacy' | 'supermarket' | 'fuel';

export type NearbyPlace = {
  id: string;
  kind: PlaceKind;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  openingHours?: string;
  maybeOpen24h: boolean;
};

export const PLACE_KIND_NL: Record<PlaceKind, string> = {
  police: 'Politie',
  hospital: 'Ziekenhuis',
  clinic: 'Huisartsenpost of kliniek',
  pharmacy: 'Apotheek',
  supermarket: 'Supermarkt',
  fuel: 'Tankstation',
};

export const SAFE_PLACES_DISCLAIMER_NL =
  'Plekken komen van OpenStreetMap, alleen als jij zoekt. Openingstijden kunnen ontbreken of verouderd zijn. SafeWalk beoordeelt niet of een plek veilig of nu open is, en is geen hulpdienst.';

export function overpassQuery(lat: number, lng: number, radiusM = OVERPASS_RADIUS_M): string {
  if (!validCoords(lat, lng)) throw new Error('BAD_COORDS');
  const r = Math.min(Math.max(Math.round(radiusM), 200), 5000);
  const around = `(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:20];(
  nwr["amenity"="police"]${around};
  nwr["amenity"="hospital"]${around};
  nwr["amenity"="clinic"]${around};
  nwr["amenity"="pharmacy"]${around};
  nwr["shop"="supermarket"]${around};
  nwr["amenity"="fuel"]${around};
);out center tags;`;
}

export function classifyTags(tags: Record<string, string> | undefined): PlaceKind | null {
  if (!tags) return null;
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'clinic') return 'clinic';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.amenity === 'fuel') return 'fuel';
  return null;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type OverpassEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export function parseOverpass(data: { elements?: OverpassEl[] } | null | undefined, origin: { lat: number; lng: number }): NearbyPlace[] {
  if (!validCoords(origin.lat, origin.lng)) return [];
  const out: NearbyPlace[] = [];
  const seen = new Set<string>();
  for (const el of data?.elements ?? []) {
    const kind = classifyTags(el.tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!kind || !validCoords(lat, lng)) continue;
    const plat = lat as number;
    const plng = lng as number;
    const id = `${el.type ?? 'n'}/${el.id ?? `${plat},${plng}`}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hours = el.tags?.opening_hours?.trim();
    const name = (el.tags?.name || el.tags?.['name:nl'] || PLACE_KIND_NL[kind]).trim();
    out.push({
      id,
      kind,
      name,
      lat: plat,
      lng: plng,
      distanceM: Math.round(haversineM(origin.lat, origin.lng, plat, plng)),
      openingHours: hours || undefined,
      maybeOpen24h: !!hours && /24\/7/i.test(hours),
    });
  }
  const order: PlaceKind[] = ['police', 'hospital', 'clinic', 'pharmacy', 'supermarket', 'fuel'];
  out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.distanceM - b.distanceM);
  return out.slice(0, 40);
}

export function placeNavigateUrl(lat: number, lng: number, os: string): string | null {
  const links = navigationLinks(lat, lng);
  if (!links) return null;
  return os === 'ios' ? links.apple : links.google;
}
