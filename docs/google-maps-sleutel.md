# Google Maps-sleutel voor Android

Zonder sleutel toont de app op Android bewust geen kaart (PR10-fallback), zodat de app niet crasht. iOS gebruikt Apple Kaarten en heeft deze sleutel niet nodig.

De app leest de sleutel **alleen** uit de omgevingsvariabele `GOOGLE_MAPS_ANDROID_API_KEY` (via `app.config.ts` → `android.config.googleMaps.apiKey`). Zet die waarde nooit in git, nooit in `eas.json` en nooit in een chat.

## Wat Kevin moet aanmaken (of controleren)

1. Open Google Cloud Console en kies (of maak) een project, bijvoorbeeld “SafeWalk”.
2. Zet de **Maps SDK for Android** aan (API’s en services → bibliotheek).
3. Maak een **API-sleutel**.
4. Beperk de sleutel:
   - Toepassingsbeperking: **Apps voor Android**.
   - Pakketnaam: `nl.safewalk.app`.
   - SHA-1: de vingerafdruk van de **Play-app-ondertekenings Sleutel** (niet alleen de upload-sleutel). Die vind je in Play Console → SafeWalk → Instellingen → App-ondertekening.
   - API-beperking: alleen **Maps SDK for Android**.
5. De Maps SDK for Android valt onder het [gratis maandelijkse tegoed van Google Maps](https://mapsplatform.google.com/pricing/). Voor het huidige gebruik van SafeWalk hoeft er in de regel niet betaald te worden; controleer zelf het actuele tegoed en zet eventueel quota of een budgetalert.

## Hoe de sleutel in een build komt

- Lokaal: exporteer `GOOGLE_MAPS_ANDROID_API_KEY` in je schil, of zet hem in een niet-gecommitte `.env`. Een lokale kopie kan op de ontwikkelmachine staan in `/workspace/safewalk-builds/.google-maps-android-key` — die file hoort niet in de repo.
- EAS: later, **alleen na Kevins akkoord**, als EAS-secret `GOOGLE_MAPS_ANDROID_API_KEY`. Daarna pikt een nieuwe Android-build hem automatisch op. Zonder die secret blijft de kaartfallback actief.
- Deze pull request voegt de sleutel zelf niet toe en zet geen EAS-secret.

Na een build met sleutel is `extra.mapsConfigured.android` waar, en toont de app de kaart.
