# Architectuur SafeWalk (offline, kindermodus en permissies)

**Laatst bijgewerkt:** 15 november 2026 (Europe/Amsterdam). Dit beschrijft de code in deze branch. Het is geen belofte over Play-goedkeuring of device-gedrag.

## Mappen en modules

| Pad | Rol |
|---|---|
| `app/` | Schermen (Expo Router). Nieuw: `kind`, `kind/koppelen`, `settings/kinderen`, `ouder/[linkId]`. |
| `src/lib/` | Clientlogica: locatie (`location.ts`), SOS-wachtrij (`sos.ts`), offline-retry (`offlineRetry.ts`), verbinding (`connectionStatus.ts`), valdetectie (`fallDetect.ts`), plekken-cache (`offlinePlaces.ts`). |
| `src/components/` | UI, o.a. `ConnectionBanner`, `ShakeSosListener` (ook valdetectie). |
| `convex/` | Server: schema, sessies, SOS, incidenten, `childLinks.ts`, `childGeo.ts`, `geofence.ts`. |
| `docs/` | Privacy, data-safety, deze architectuur, offline-testen. |
| `modules/safewalk-native/` | Volume×2 (alleen Android, sessie/voorgrond) en alarm-voorgronddienst. Geen achtergrond-zaklamp. |

Bestaande modules zijn hergebruikt; de app is niet opnieuw gebouwd.

## Offline-wachtrij (store-and-forward)

Opslag is **AsyncStorage**, niet expo-sqlite: die dependency zit niet in het project en zou een nieuwe native build vragen. SQLite is een logische vervolgstap na een goedgekeurde EAS-build.

Wachtrijen:

| Wachtrij | Key | Inhoud |
|---|---|---|
| Locatie | `safewalk.locationQueue` | Punten met `clientId` (`sessionId:timestamp`), lat/lng, nauwkeurigheid, tijd, optioneel batterij |
| SOS | `safewalk.sosQueue` | Payload met `clientRef` (idempotent) |
| Incident-pings | `safewalk.incidentQueue` | Pings tijdens gevaarmodus, idempotent via `clientId` |

Schema (logisch, JSON-array per key): `{ id, payload, attempts, nextAt, lastError? }`.

Backoff: `min(60s, 2s × 2^attempts)`. Bij internet (NetInfo) en elke 15 s wordt gespuid. Locatiepunten gaan in batches (max. 40) naar `sessions.addLocations`. De server dedupliceert op `(sessionId, clientId)`.

Tijdens een gevaar-alarm: GPS-interval **5 s**, nauwkeurigheid `BestForNavigation` (anders High). Tijdens “loop met me mee” / gewone reis: **30 s**. Zonder netwerk blijft het punt lokaal; de app claimt niet dat contacten het al hebben.

## Gegevensstroom (kort)

1. GPS-chip (`expo-location`, High / BestForNavigation) → lokale wachtrij.
2. Bij internet → Convex (`addLocation` / `addLocations` / `sos.trigger` / `incidents.pingLocation`).
3. Convex stuurt push naar gekozen contacten (of ouder + door de ouder gekozen contacten).
4. Geen internet, wel mobiel netwerk: banner “Alleen SMS”; gebruiker kan zelf een vooringevulde sms versturen. **Geen automatische sms.**
5. Helemaal geen bereik: banner “Geen bereik – locatie wordt bewaard…”. Niets kan verstuurd worden.

## Kindermodus

- Ouder (16+) accepteert een toestemmingstekst in het eigen account en maakt een eenmalige code (30 min). Dat is **geen identiteitscontrole**.
- Kind (13–15) voert die code in. Onder 13 blijft geblokkeerd. Zonder koppeling blijven SOS en locatie dicht.
- Kind-UI: grote SOS, “veilig thuis/school”, zichtbare tekst “Je locatie wordt gedeeld met …”. Kind kan SOS niet uitzetten; ouder kiest contacten en zones.
- Delen gebruikt dezelfde voorgronddienst / “tijdens gebruik” als een reis. **Geen `ACCESS_BACKGROUND_LOCATION`.** Stopt de app, dan ziet de ouder de laatst bekende locatie en “verbinding verbroken”.
- Zones thuis/school worden gecontroleerd bij binnenkomende punten (dus alleen terwijl er gedeeld wordt).
- Opnames, aankopen, eigen contactenbeheer en de AI-assistent blijven voor 13–15 dicht.

## Bewust niet (of beperkt) gebouwd

| Onderdeel | Status |
|---|---|
| Zaklamp-strobe bij gevaar | Al aanwezig (`expo-camera` torch, 2 Hz, alleen met opt-in). Stil alarm slaat geluid, licht en opname over. |
| Automatische sms | Onmogelijk betrouwbaar: Play (SMS-permissie bijna nooit voor een veiligheidsapp) en iOS (geen achtergrond-sms). Alleen composer. |
| Volledige offline kaarttegels (MapLibre/OSM) | Niet gebouwd (native dependency). Wel: lokale cache van de laatste Overpass-lijst (max. 24 u). |
| Vermomd app-icoon en -naam | Niet gebouwd. Op Android kan dat later met activity-aliases en extra iconen in een config plugin; op iOS met alternative icons (extra assets, review). Risico op afkeuring en verwarring bij meldingen. |
| expo-sqlite | Vervolg na native build. |
| Bluetooth-mesh | Stretch, niet gebouwd. |

## Permissies (waarom)

| Permissie | Platform | Reden | Wanneer |
|---|---|---|---|
| Locatie “tijdens gebruik” (foreground / WhenInUse) | Android + iOS | GPS-punten tijdens reis, alarm, kindermodus, plekken zoeken | Na uitleg, als de gebruiker deelt of zoekt |
| Voorgronddienst locatie (`FOREGROUND_SERVICE_LOCATION`) | Android | Delen met scherm uit tijdens een zelf gestarte sessie, met zichtbare melding | Alleen tijdens die sessie |
| `UIBackgroundModes: location` | iOS | Zelfde, met blauwe indicator | Alleen tijdens die sessie |
| **`ACCESS_BACKGROUND_LOCATION` / “Altijd”** | — | **Niet aangevraagd.** Play keurt dit streng, bij kinderen nog strenger. Documenteer dit zo in de Play-verklaring. | — |
| Microfoon | Android + iOS | Versleutelde opname bij “niet veilig”, alleen na toestemming | Alleen 16+, niet bij stil alarm |
| Camera / zaklamp (torch) | Android + iOS | Strobe tijdens gevaarmeld, alleen met opt-in (fotosensitiviteit) | Alleen als aangezet; niet op web; niet bij stil alarm |
| Contacten (adresboek) | Android + iOS | Gebruiker vinkt nummers aan voor zelf verstuurde sms/WhatsApp | Alleen 16+, na toestemming |
| Meldingen | Android + iOS | Push aan contacten / ouder | Optioneel |
| Bewegingssensor (geen `ACTIVITY_RECOGNITION`) | — | Schudden en valdetectie, alleen lokaal, app op voorgrond | Opt-in, uit voor valdetectie |
| **`SEND_SMS` / `SMS`** | — | **Niet gebruikt.** Play staat deze permissie bijna nooit toe voor dit type app; iOS heeft geen equivalent voor automatisch versturen. De app opent alleen de systeem-composer. | — |

Volume×2 met vergrendeld scherm: op Android alleen terwijl een SafeWalk-sessie/voorgronddienst loopt; op iPhone niet mogelijk.
