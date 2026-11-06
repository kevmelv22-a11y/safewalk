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
| 7 | Geen auto-112 | **Geïmplementeerd** | Expliciete knop → Android `ACTION_DIAL` (`openEmergencyDialer`), iOS/public `tel:112`; gebruiker bevestigt zelf; nooit vanuit SOS/gevaar-start |
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

## 10. Native snelkoppelingen & achtergrond (mijlpaal “Bouw dat”) — bronstatus

### Geïmplementeerde bron / config (nog **uncompiled** tot development build)
| Entry point | Platform | Bron | Gedrag |
|---|---|---|---|
| Home Screen Quick Actions | iOS (+ Android dynamic) | `expo-quick-actions` + `app.json` `iosActions` → `/quick-ping` | Opent app; vereist unlock zoals OS |
| Quick Settings tile / iOS 18 Control | Android 7+ / iOS 18+ | `react-native-quick-settings-tile` → `safewalk://quick-ping` | `requireUnlock: true`; **geen** `ios.appGroup` (signing/adhoc behouden) |
| Volume×2 | Android foreground only | `modules/safewalk-native` + MainActivity `dispatchKeyEvent` plugin | Geen Accessibility; iOS = unsupported |
| Deep link / in-app | alle | `/quick-ping`, dashboard-knop | Werkt op web/dev zonder native compile |
| Alarm audio background attempt | iOS/Android | `expo-audio` `enableBackgroundPlayback: true` | **Niet** native getest; Android FGS media; OS kan dempen |
| Torch background | — | — | **Niet ondersteund** (CameraView foreground) |
| Silent mic background | — | `enableBackgroundRecording: false` | Alleen met toekomstige expliciete consent + OS disclosure |

**Niet oplosbaar in software:** power-off, force-stop, OS kill, airplane mode zonder netwerk voor push.

**Signing IDs:** `nl.safewalk.app` ongewijzigd; tile zonder app group zodat wildcard/adhoc niet breekt.

### Push pipeline
- Server: `convex/push.ts` tickets → receipts; CRITICAL retries incl. `unsafe`/`wrong_pin`/`come_quick`.
- Client: `registerPush()` retourneert gestructureerde fouten (`permission_denied`, `token_failed`/APNs-hint, …).
- **Geblokkeerd zonder user-config:** APNs key in Expo/EAS; FCM; fysiek toestel. Geen credentials hier opgehaald; geen echte pushes vanuit deze agent-run.

### E2E-opnames — evaluatie (geen nep-E2E)
**Huidige garantie (getest in Convex):** TLS + server ACL + tijdelijke storage-URL; revoke/expiry voor share-tokens. **Geen** end-to-end encryptie.

**Waarom geen snelle “volledige E2E” in deze pass:**
1. Key distribution naar trusted app-users + optionele externe fragment-keys + recovery/backup is een hoog-risico herontwerp (auth, device keys in Secure Enclave/Keystore, forward secrecy, multi-device).
2. Server-side “encryptie met sleutel die de server kent” is **geen** E2E — claimen we niet.
3. Reeds gedownloade plaintext/ciphertext-kopieën zijn na revoke niet intrebaar — moet eerlijk in UX.

**Voorgestelde architectuur (nog niet geïmplementeerd):**
- Per-opname DEK (AES-256-GCM) in Secure Store / Keystore; ciphertext in Convex storage.
- Wrap DEK voor elke trusted contact met diens public key (device-bound); server bewaart alleen wrapped blobs + ACL.
- Externe link: DEK in URL **fragment** (`#key=`) — server ziet fragment niet; TTL/revoke stopt nieuwe ciphertext-URLs, niet oude downloads.
- Migratie: bestaande `recordings` markeren `encryption: 'none'`; nieuwe `encryption: 'e2e-v1'`.
- Limieten: max 25 MB; streaming/chunked encryptie i.p.v. alles in RAM; key deletion bij account delete.

**Minimale ondersteunde scope nu:** TLS+ACL (bestaand) + documentatie. Eerstvolgende veilige increment (apart): client-side encryptie vóór upload met sleutel alleen op owner-device (contacten kunnen dan **niet** beluisteren tot key-share klaar is) — dat is owner-only seal, geen multi-party E2E.

### Fysieke tests
Onmogelijk zonder user-gevraagde native/EAS build op echte telefoons. Web/Metro dekt UI-routes; native modules: plugin/unit source checks only.


## 11. Recording encryption — applied mode (bounded, not proven E2E)

**Mode `e2e-v1`:** AES-256-GCM (@noble/ciphers) on the device before upload; AAD = `safewalk-rec-aad-v1|ownerId|clientUploadId`. The DEK stays in SecureStore (native, this device only). On web it is in **localStorage**: it survives across tabs, but it is readable by scripts on the origin. The server stores ciphertext plus optional wrapped DEKs. The audited libraries do **not** make this system audited.

| Topic | Status |
|---|---|
| Upload | Authenticated proxy `POST /recordings/upload` (Bearer Convex auth). The server stores the bytes itself and creates the row in the same request. No client-visible unclaimed storageId (the `generateUploadUrl`/`finalize` flow has been removed). Size is measured on the server; e2e-v1 only; max 19 MB (Convex HTTP limit 20 MB). If the insert fails, the stored file is deleted right away. |
| Download (app) | `GET /recordings/blob?id=` with Bearer; ACL (owner, accepted contact + envelope) is re-checked on **every** request; `Cache-Control: no-store`. No `storage.getUrl` is ever handed out. |
| Download (external link) | `/track/recording?token&id` streams bytes; token, revoke, expiry and incident scope re-checked on each request. The player HTML no longer contains a storage URL. **Bytes that were already downloaded cannot be revoked.** |
| Envelopes | v2: X25519 + HKDF + AES-GCM with AAD `safewalk-env-v2|recordingId|clientUploadId|ownerId|recipientId|recipientKeyId`. v1 (without AAD) remains readable. |
| Public-key authenticity | The server delivers contact keys and **could swap them** (no identity guarantee). Mitigation: fingerprints (SHA-256, 32 hex) in the Recordings screen + explicit local pin. If a contact's key changes after pinning, the app does not share with them. Unpinned contacts are still shared with (TOFU-less). |
| Keys / rotation | No silent creation or rotation. "Create" and "Replace" are explicit buttons. Replacing revokes the old public key; envelopes for the old key become unreadable for you. Old sessionStorage keys on web are migrated once to localStorage. |
| Key loss | Shown before use (Recordings + recording controls): no recovery, no multi-device. Out of scope. |
| CSPRNG | Native: `expo-crypto.getRandomBytes` injected via `setRandomSource` (no global polyfill). Web/Node: `crypto.getRandomValues`. Missing → `NO_CSPRNG` error, never a weak fallback. |
| Playback | Web: Blob object URL, revoked on close/unmount. Native: plaintext temp file in the cache dir, deleted on close/unmount (best effort; if the app is killed it can remain until the OS clears the cache). After a successful upload the recorder's original is deleted. |
| Memory | The whole recording is held in memory (max 19 MB plaintext + ciphertext). No streaming encryption. |

### Retention policy (cron `recording-retention`, every 6 h, max 100 per category)
1. Rows soft-deleted > 30 days ago: hard-delete (plus file and envelopes, if still present).
2. Envelopes whose recording is gone/deleted, or whose recipient is no longer an accepted contact: delete.
3. Orphan files: `_storage` objects > 24 h old that no recording references (leftovers from the old upload flow). Walked by cursor. **Recordings are the only storage user**; new storage uses must be excluded here first.
4. **Live recordings are never deleted by age.** No age-based retention without a confirmed policy.
