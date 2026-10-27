// Gedeelde geo-hulpfuncties (server + client).
export type Pt = { lat: number; lng: number };
export function haversineMeters(a: Pt, b: Pt): number {
  const R = 6371e3, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const ALMOST_ARRIVED_M = 300;
export const WALK_SPEED_MPS = 1.35; // ~4,9 km/u
/** Ruwe ETA in ms op basis van hemelsbrede afstand en loopsnelheid × 1,3 omwegfactor. */
export const roughEtaMs = (from: Pt, to: Pt, speedMps = WALK_SPEED_MPS) => (haversineMeters(from, to) * 1.3 / speedMps) * 1000;
