/** Pure geofence-hulp (enter/leave). Geen netwerk, geen toestemming. */
export type Fence = { lat: number; lng: number; radiusM: number };

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isInsideFence(point: { lat: number; lng: number }, fence: Fence): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  if (fence.radiusM <= 0 || fence.radiusM > 5_000) return false;
  return haversineMeters(point, fence) <= fence.radiusM;
}

/** Eerste punt zet alleen de stand; daarna enter/leave bij een echte overgang. */
export function fenceTransition(prevInside: boolean | undefined, inside: boolean): 'enter' | 'leave' | null {
  if (prevInside === undefined) return null;
  if (prevInside === inside) return null;
  return inside ? 'enter' : 'leave';
}
