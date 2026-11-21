# Kaart op Android: geen Google-sleutel

De Android-kaart gebruikt **geen Google Maps API-sleutel**. In plaats daarvan toont de app een OpenStreetMap-kaart via OpenFreeMap-tegels (MapLibre GL JS in een WebView). Er is geen registratie, geen betaalde API en geen kaart nodig.

iOS blijft Apple Kaarten gebruiken (`react-native-maps`, `PROVIDER_DEFAULT`). Die heeft geen sleutel nodig.

## Wat dit betekent

- Zet `GOOGLE_MAPS_ANDROID_API_KEY` niet in git, niet in `eas.json` en niet in een chat. `app.config.ts` negeert die variabele als hij toch in de omgeving staat, en schrijft geen `android.config.googleMaps` meer.
- Een eventueel eerder aangemaakte Google-sleutel of EAS-secret is voor de kaart niet meer nodig. Verwijder die secret alleen als Kevin dat later expliciet vraagt.
- Een **nieuwe Android-build** is nodig voordat de OSM-kaart in een geïnstalleerde app verschijnt, omdat `react-native-webview` een native module is. Deze documentatie beschrijft de bron; er is in deze wijziging geen EAS-build gestart.
- Lukt het laden van de kaart niet (geen netwerk, oude binary zonder WebView), dan blijft de bestaande fallback: geen kaart in de app, wel zoeken op adres en een link naar de laatste locatie.
- Tegels komen van OpenFreeMap (openbare instantie, gegevens van OpenStreetMap). Dat is geen officieel OSM.org-tegelservicetarief; de app gebruikt niet `tile.openstreetmap.org`. Bij de kaart staat “© OpenStreetMap-bijdragers”.
- OpenFreeMap ziet het IP-adres van het toestel en het bekeken kaartgebied. Zie het privacybeleid.

De lokale file `/workspace/safewalk-builds/.google-maps-android-key` hoort niet in de repo en wordt door de app niet meer gelezen.
