# SafeWalk – engineering (mijlpaal 1+)

**Laatst bijgewerkt:** 6 november 2026 · **Stack (bestaand):** Expo SDK 58 / React Native / TypeScript / Expo Router · Convex + Convex Auth · RevenueCat (Premium).

## Techstack-rationale
- **Expo + RN:** één codebase iOS/Android/web; bestaande SafeWalk-app en brand blijven.
- **Convex:** server-autoriteit voor PIN, incidenten, pushes en toegangscontrole (geen client-autoritatief succes).
- **Geen automatische 112:** alleen `tel:112` via gebruikersactie.
- **Gratis-tier voorkeur:** OSM later voor publieke tracking-links; Resend gratis voor auth-mail; geen betaalde SMS-provider zonder goedkeuring.

## Datamodel (nieuw in mijlpaal 1)
| Tabel/veld | Doel |
|---|---|
| `profiles.pinHash` / `pinSalt` / `pinSetAt` | PBKDF2-SHA256 (210k) + random 16-byte salt; nooit plaintext |
| `profiles.torchStrobeOptIn` | Expliciete fotosensitiviteits-opt-in |
| `incidents` | Actieve gevaarmodus (`unsafe` / later uitbreidingen) |
| `alerts.kind` + `pushMessages.kind` | `unsafe`, `come_quick`, `arrived_safe`, `wrong_pin` |

`profiles.me` **strip** `pinHash`/`pinSalt` altijd.

## Feature-index (code)
| Feature | Server | Client |
|---|---|---|
| PIN zetten/wijzigen | `convex/security.ts` `setPin` | `app/onboarding/pin.tsx` |
| PIN verifiëren + stil alarm | `security.verifyPin` | `app/danger.tsx`, `app/dashboard.tsx` |
| Rood / oranje / groen | `convex/incidents.ts` | `src/components/ActionButtons.tsx`, `app/dashboard.tsx` |
| Alarmgeluid | — | `src/lib/dangerAlarm.ts` + `assets/sounds/alarm.wav` |
| Zaklamp-strobe | opt-in in profile | `app/danger.tsx` via `expo-camera` `enableTorch` |

## Officiële bronnen & platformbeperkingen
| Onderwerp | Bron | Beperking / aanpak |
|---|---|---|
| Torch | [Expo Camera SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/camera/) `enableTorch` | Alleen met actieve `CameraView`, device+toestemming; **niet** betrouwbaar op achtergrond/lockscreen/web. Strobe ≈2 Hz na opt-in. |
| Volume 2× | Geen betrouwbare Expo managed API voor globale hardwarekeys | **iOS:** geen betrouwbare achtergrond-volume-hooks zonder native module + foreground. **Android:** normale apps ontvangen geen volume-keys op achtergrond; AccessibilityService is disproportioneel en niet de default. **Alternatieven (fase 2 docs):** Quick Settings tile / Shortcuts / lockscreen-widget waar OS het toestaat; in-app snelle knop werkt wél. |
| Opname | `expo-camera` / `expo-audio` mic permission | Alleen na expliciete toestemming + zichtbare indicator (fase 2). Geen stille opname bij geweigerde mic. |
| Externe tracking-link | HTTP route + OSM (fase 2) | Bearer token, expiry/revoke; geen locatie in URL/logs. |
| SMS/WhatsApp | OS share sheet | Standaard: gebruiker bevestigt Send. Geen betaalde SMS-API zonder goedkeuring. |
| Push vs extern | `convex/notify.ts` | In-app push = automatisch na user-actie in app. Extern = user-confirmed composer. |

## Versleuteling (audit – geen loze claims)
- **Transit:** TLS naar Convex (platform).
- **At rest PIN:** PBKDF2-SHA256 + salt (server).
- **Opnames E2E:** *niet* geïmplementeerd in mijlpaal 1 — claim dat niet. Fase 2: vetted lib + key lifecycle of server-side access control + TLS.
- **Locatie in DB:** bestaande sessielocaties; toegangscontrole server-side (`canViewSession`).

## Testen
- `npm run typecheck` · `npx jest` · `npx vitest run` · `npm run lint`
- Convex: `convex/security.test.ts`

## Screenshot-routes (parent computerUse)
Dev: `npx expo start --web --port 8081` + lokale Convex.
| Route | Wat |
|---|---|
| `/dashboard` | Drie grote knoppen |
| `/onboarding/pin` | PIN + torch opt-in |
| `/danger?incidentId=…` | Gevaarmodus (na rood) |
| `/settings` | PIN wijzigen |
