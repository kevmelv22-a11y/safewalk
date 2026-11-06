# SafeWalk – engineering (implementatiestatus)

**Laatst bijgewerkt:** 6 november 2026 (Europe/Amsterdam) · **Repo:** bestaande Expo/Convex-app (geen nieuwe app).

## 1. Techstack + rationale
| Keuze | Waarom |
|---|---|
| **Expo SDK 58 + React Native + TypeScript + Expo Router** | Eén codebase iOS/Android/web; bestaande SafeWalk-brand en flows; managed workflow tot native builds gevraagd worden. |
| **Convex + Convex Auth** | Server-autoriteit voor PIN, incidenten, ACL, pushes; realtime queries; HTTP-actions voor publieke tracking-pagina. |
| **RevenueCat** | Premium (bestaand project); geen nieuwe betaalde diensten zonder goedkeuring. |
| **OpenStreetMap-tegels + Leaflet (SRI)** | Gratis publieke kaart zonder betaalde Maps-API; attributie verplicht. |
| **expo-camera / expo-audio / expo-contacts / expo-location** | Torch, alarm/opname, contactpicker, locatie — altijd na expliciete toestemming. |

**Niet gekozen (nu):** Flutter (repo is Expo); betaalde SMS/WhatsApp-API; client-E2E opnames (niet geïmplementeerd — niet claimen).

## 2. Projectboom (relevant)
```
app/                    # Expo Router schermen
  dashboard.tsx         # Drie hoofdknoppen + live-locatie-nu
  danger.tsx            # Gevaarmodus: alarm, strobe, opname, PIN, tracking-share
  share-link.tsx        # Handmatige tracking-links
  device-contacts.tsx   # Telefooncontacten (toestemming + checkbox)
  recordings.tsx        # Opnamelijst / download / delete
  settings/pin.tsx      # PIN wijzigen (vereist oude PIN)
  quick-ping.tsx        # Deep link safewalk://quick-ping (volume×2-alternatief)
  onboarding/pin.tsx    # Eerste PIN + torch-opt-in
convex/
  security.ts           # PIN PBKDF2, verify, stil alarm, revoke-links bij unlock
  incidents.ts          # startUnsafe, comeQuick, pingLocation, sendLiveLocationNow
  tracking.ts           # shareLinks hash-only, resolvePublic, HTTP live/location/recording
  recordings.ts         # upload finalize, ACL download, delete+storage
  deviceContacts.ts     # minimale naam+E164
  schema.ts             # datamodel
  http.ts               # /track/live|/location|/recording
src/lib/alarmGuard.tsx  # Alarm zolang server-incident actief
src/components/…        # ActionButtons, PinPad, RecordingControls, …
docs/engineering.md     # dit document
```

## 3. Datamodel (actueel)
| Tabel | Kernvelden | Notities |
|---|---|---|
| `profiles` | `pinHash`, `pinSalt`, `pinSetAt`, `torchStrobeOptIn` | Hash nooit via `me` gelekt |
| `incidents` | `kind`, `status`, `alertId`, `sessionId`, `torchRequested` | Actieve gevaarmodus |
| `incidentLocations` | `incidentId`, lat/lng, `recordedAt` | Updater-bron voor tracking zonder trip |
| `shareLinks` | `tokenHash`, `scopes[]`, `locationConsent`, `incidentId?`, `sessionId?`, `expiresAt`, `revokedAt?` | Raw token één keer; elke request her-checkt expiry/revoke |
| `recordings` | `storageId`, `incidentId?`, `deletedAt?` | Convex storage; tijdelijke `getUrl` |
| `deviceContacts` | `displayName`, `phoneE164` | Alleen aangevinkte |
| `alerts` / `pushMessages` | kinds o.a. `unsafe`, `come_quick`, `arrived_safe`, `wrong_pin` | In-app push |
| Retention (ongewijzigd) | `RETENTION_AFTER_END_MS` 24u · `RETENTION_MAX_MS` 3d in `convex/lib.ts` | **Geen stille wijziging van juridisch retentiebeleid** |

## 4. Feature-code-index (8 eisen)
| # | Eis | Status | Code |
|---|---|---|---|
| 1 | Grote knoppen rood/oranje/groen | **Geïmplementeerd** | `ActionButtons`, `dashboard` |
| 2 | Gevaar: zaklamp+alarm tot PIN | **Geïmplementeerd (foreground)**; OS-kill/power-off kan stoppen | `danger`, `dangerAlarm`, `AlarmGuard`, `security.verifyPin` |
| 3 | PIN onboarding; stop/veilig alleen met PIN | **Server-autoritatief** | `security.setPin/verifyPin`, `onboarding/pin`, `settings/pin` |
| 4 | Stil alarm bij verkeerd wachtwoord | **Geïmplementeerd**; exacte NL-tekst | `security.verifyPin` → push body |
| 5 | Live locatie zonder app (tracking-link) | **Geïmplementeerd** OSM+Leaflet SRI; live alleen met updater+verse ping | `tracking`, `/track/*`, `share-link`, auto in `startUnsafe` |
| 6 | Volume 2× = live locatie | **Niet als native background**; **wel** foreground: knop + `quick-ping` deep link | `sendLiveLocationNow`, `dashboard`, `quick-ping` |
| 7 | Geen auto-112 | **Geïmplementeerd** | alleen `tel:112` user-actie |
| 8 | Audio bij “niet veilig” | **Geïmplementeerd** na mic-consent; zichtbare status; TLS+ACL; **kan alarmgeluid bevatten** | `danger` + `recordings` |

## 5. Security / privacy garanties (evidence-based)
- PIN: PBKDF2-SHA256 210k + salt; overwrite vereist `currentPin`; auth + rate limits.
- Tracking: token gehashed; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, CSP; Leaflet via **SRI**; geen raw token in audit logs.
- Opnames: geen permanente publieke URL in DB; `getUrl` tijdelijk; ACL owner + accepted trusted contact; extern alleen share-scope `recording` + geldige token (elke request her-checkt).
- Delete: soft-delete + `storage.delete`.
- Eind incident: `revokeForIncidents` plant revoke van gekoppelde share-links.
- Encryptie: TLS in transit; platform at-rest; **geen E2E-claim**.
- Offline/PIN-server down: UI zegt eerlijk dat unlock server nodig heeft — geen veiligheidsclaim.

## 6. Officiële bronnen – OS-beperkingen
| Onderwerp | Bron | Beperking |
|---|---|---|
| Torch | [Expo Camera `enableTorch`](https://docs.expo.dev/versions/v58.0.0/sdk/camera/) | Vereist actieve CameraView + toestemming; niet betrouwbaar background/lockscreen/web. |
| Mic/opname | [Expo Audio](https://docs.expo.dev/versions/v58.0.0/sdk/audio/) | Expliciete permission; indicator verplicht (UX). |
| Contacten | [Expo Contacts](https://docs.expo.dev/versions/v58.0.0/sdk/contacts/) | Runtime permission; we slaan alleen selectie op. |
| Locatie | [Expo Location](https://docs.expo.dev/versions/v58.0.0/sdk/location/) · [Apple background location](https://developer.apple.com/documentation/corelocation) · [Android background location](https://developer.android.com/develop/sensors-and-location/location/background) | Background alleen met juiste permissies + foreground service/always; niet getest als “native bewezen” vanuit web. |
| Hardware volume keys | iOS: apps krijgen geen globale volume-events in background. Android: [KeyEvent](https://developer.android.com/reference/android/view/KeyEvent) niet betrouwbaar voor derden-apps op achtergrond zonder Accessibility (disproportioneel). | **Present:** in-app knop + `safewalk://quick-ping`. **Gepland (native build):** Shortcuts / Quick Settings tile / widget — niet gesimuleerd. |
| OSM tiles | [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) | Attributie, redelijk gebruik, geen bulk scrape. |

## 7. Testen
```
npx convex codegen
npm run typecheck
npx jest
npx vitest run
npm run lint
```
Convex o.a.: `security.test.ts`, `security.adversarial.test.ts`, `phase3.access.test.ts` (tracking revoke/live, recordings ACL/delete, contacts minimisatie, consent gates).

## 8. Wat native testing / config nog vereist
- Torch-strobe op fysiek toestel; background location tijdens trip; mic+alarm audio-bleed subjectief.
- expo-contacts picker op iOS/Android (web toont bewuste fout).
- Deep link `safewalk://quick-ping` in OS / Shortcuts.
- Push tokens + Resend/Google/RC Authorization secrets (user).
- Store listing / KvK / juridische review.
- **Geen EAS/store builds** tot expliciet gevraagd.

## 9. Screenshot-routes (dev server)
Fresh Metro (cache cleared): **`http://localhost:8081`** (web). Routes in bundle: `share-link`, `device-contacts`, `recordings`, `settings/pin`, `quick-ping`, `dashboard`, `danger`, …
| Route | UI |
|---|---|
| `/dashboard` | Hoofdknoppen + “Stuur live locatie nu” |
| `/danger` | Gevaarmodus (na rood) |
| `/share-link` | Tracking-links |
| `/device-contacts` | Contactpicker |
| `/recordings` | Opnames |
| `/settings` · `/settings/pin` | Instellingen / PIN |
| `/quick-ping` | Foreground volume-alternatief |
| `/onboarding/pin` | Eerste PIN |

Web SPA: HTTP 200 op path + routes in `entry.bundle` (geen browser-automation in deze run).
