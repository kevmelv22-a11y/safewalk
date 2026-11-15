/** Geldige WGS84-coördinaten. Voorkomt NaN/Infinity in kaarten en links. */
export function validCoords(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function mapsQueryUrl(lat: number, lng: number): string | null {
  if (!validCoords(lat, lng)) return null;
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
