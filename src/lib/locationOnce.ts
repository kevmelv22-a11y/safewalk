import * as Location from 'expo-location';

/** Verse locatie alleen met vooraf gegeven toestemming; nooit stilzwijgend. */
export async function getConsentedLocation(): Promise<{ lat: number; lng: number; accuracyM?: number; locationAt: number; locationConsent: true } | { locationConsent: false }> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return { locationConsent: false };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      locationConsent: true,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? undefined,
      locationAt: pos.timestamp || Date.now(),
    };
  } catch {
    return { locationConsent: false };
  }
}
