# SafeWalk – Samen veilig thuis

Persoonlijke veiligheidsapp: deel je reis tijdelijk met vertrouwde contacten. Bevestig je niet op tijd dat je veilig bent aangekomen, dan waarschuwt de **server** je contacten.

> ⚠️ **SafeWalk is geen officiële hulpdienst.** De app belt 112 nooit automatisch en kan niet garanderen dat pushmeldingen aankomen. De 112-knop opent alleen de telefoon-app.

## Stack
Expo SDK 58 · Expo Router · TypeScript · **Convex** (database, reactieve queries, mutations, actions, crons, HTTP-actions) · **Convex Auth** (wachtwoord) · expo-location + expo-task-manager · expo-notifications · react-native-maps · Zustand · RevenueCat (`react-native-purchases`) · optioneel OpenAI · Admin: Vite + React.

## Functies
| Onderdeel | Waar |
|---|---|
| Onboarding: welkom, account, inloggen, locatie-/meldingentoestemming (met uitleg), contacten, veiligheidsinstellingen, dashboard | `app/` |
| Toegangscontrole (vervangt RLS) | `convex/lib.ts` → `canViewSession` |
| Uitnodigen via link (alleen SHA-256-hash opgeslagen, 7 dagen), accepteren/weigeren, verwijderen, blokkeren/deblokkeren, misbruik melden | `convex/contacts.ts`, `app/contacts.tsx`, `app/report.tsx` |
| Reis: bestemming kiezen op kaart (zoeken via geocoding, tikken/slepen), sessiespecifieke kijkers, voor-/achtergrondlocatie met offline-buffer, stoppen, kijker intrekken | `app/session/*`, `src/lib/location.ts` |
| Live kaart (donkere stijl): afgelegde route, hemelsbrede richting + ruwe ETA (bewust geen routeadvies), nauwkeurigheid, laatste update, waarschuwing verouderde data | `src/components/LiveMap.tsx`, `app/watch/[id].tsx` |
| Meldingen: reis gestart, contact deelt locatie, bijna aangekomen (< 300 m), check-in vereist, check-in gemist, SOS (+ vals alarm), reis beëindigd | `convex/notify.ts`, `convex/push.ts` |
| Afleverstatus per ontvanger met **Expo push receipts**: *verstuurd* / *mislukt* / *onbekend* | `push.deliver` → `push.checkReceipts` (na 15 min, retries) |
| SOS: aftelling + annuleren, incident, push met laatste locatie, retries, offline-wachtrij (idempotent), tel:112-knop | `convex/sos.ts`, `app/sos.tsx` |
| Check-in: deadline + respijt server-side, cron elke minuut, "Alles goed?" met verlengen | `convex/monitor.ts`, `convex/crons.ts` |
| Bewegingsdetectie (opt-in, Premium): lang stilstaan, afwijking van bestemming, geen nieuwe locatie → **alleen** extra check-in voor de gebruiker zelf, nooit automatisch alarm | `convex/motion.ts` |
| Premium €2,99/maand via RevenueCat (entitlement `premium`), paywall, webhook | `app/premium.tsx`, `convex/billing.ts`, `src/lib/purchases.ts` |
| AI-veiligheidsassistent (optioneel, Premium) | `convex/assistant.ts`, `app/assistant.tsx` |
| Adminpaneel: gebruikers, misbruikmeldingen, beperkingen, geanonimiseerde statistieken, foutlogs, abonnementen, auditlog – **geen locaties** | `admin/`, `convex/admin.ts` |
| Instellingen: donker/licht/systeem, respijt, SOS-aftelling, bewegingsdetectie, geblokkeerde personen, geschiedenis, locatiegeschiedenis/account verwijderen | `app/settings.tsx` |
| Rate limiting, auditlog, bewaarbeleid (locaties 24 u na einde, max 3 dagen; reismetadata 90 dagen; alert-coördinaten 30 dagen) | `convex/lib.ts`, `monitor.purge` |

### Gratis vs Premium (server-side afgedwongen)
| Gratis (altijd) | Premium |
|---|---|
| SOS, 2 contacten, tijdelijk delen, basis-check-ins (+10/+20 min, 5 min respijt), 7 dagen geschiedenis | 20 contacten, 90 dagen geschiedenis, aanpasbare check-ins/respijt, bewegingsdetectie, AI-assistent |

SOS werkt ook voor beperkte accounts.

### Privacymodel
Alle data loopt via functies in `convex/`; elke functie controleert de ingelogde gebruiker. Een kijker krijgt locaties alleen als: geaccepteerd vertrouwd contact **én** gekozen voor **deze** reis **én** reis actief en niet verlopen **én** toegang niet ingetrokken **én** geen blokkade **én** kijker niet beperkt. Intrekken/verwijderen/blokkeren/beëindigen werkt direct (reactieve queries). Er is geen admin-functie die locaties of bestemmingen teruggeeft; statistieken zijn tellingen (1–4 als "<5").

## Lokaal ontwikkelen (zonder account)
```bash
npm install && npm --prefix admin install
./scripts/codegen.sh                     # lokale anonieme Convex-backend, genereert convex/_generated
npm run typecheck                        # app + convex + admin
npm test                                 # Jest (clientlogica)
npm run test:convex                      # convex-test + Vitest (serverlogica)
```

## Convex Cloud
Project `safewalk`: dev- en prod-deployment. Auth-sleutels (`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`) staan al op beide.
```bash
npx convex deploy -y                     # prod (vereist CONVEX_DEPLOY_KEY of login)
```
Extra omgevingsvariabelen (per deployment, `npx convex env set NAAM waarde`):
| Variabele | Nodig voor |
|---|---|
| `EXPO_ACCESS_TOKEN` | optioneel: Expo push security |
| `REVENUECAT_WEBHOOK_SECRET` | Premium-webhook (zelfde waarde als "Authorization header" in RevenueCat) |
| `OPENAI_API_KEY`, optioneel `OPENAI_MODEL` | AI-assistent (zonder sleutel netjes uitgeschakeld) |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | E-mailverificatie en wachtwoordherstel (OTP-codes) via Resend (gratis tier). `AUTH_EMAIL_FROM` bv. `SafeWalk <noreply@jouwdomein.nl>` (geverifieerd domein); standaard `onboarding@resend.dev` (alleen naar je eigen Resend-adres). Zonder sleutel geeft de server `EMAIL_NOT_CONFIGURED` en ziet de gebruiker een duidelijke melding. |
| `AUTH_EMAIL_DEV_LOG=true` | **Alleen lokaal/dev**: zonder Resend-sleutel wordt de code in de Convex-logs gezet (`npx convex logs`). Nooit op prod zetten. |
| `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth (zie `npx @convex-dev/auth`); `SITE_URL` moet een geldige URL zijn. |

Beheerder aanwijzen: `npx convex run admin:grantAdmin '{"email":"jij@…"}'` (met `--prod` voor productie).

## App (development build vereist)
Achtergrondlocatie, TaskManager, push en aankopen werken **niet** in Expo Go.
```bash
npx eas build --profile development --platform android   # of ios
npx expo start --dev-client
```
App-omgeving (`.env` / EAS-secrets): `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `GOOGLE_MAPS_ANDROID_API_KEY`. Vul `extra.eas.projectId` in `app.json`.

### RevenueCat instellen
1. Producten in App Store Connect / Play Console: maandabonnement €2,99.
2. RevenueCat: entitlement **`premium`**, offering *current* met *monthly*-package.
3. Webhook: URL `https://<deployment>.convex.site/revenuecat/webhook`, Authorization header = `REVENUECAT_WEBHOOK_SECRET`.
4. De app logt bij RevenueCat in met de Convex user-id, zodat de webhook de juiste gebruiker bijwerkt.

**Huidige stand (RevenueCat-project `SafeWalk`, id `projb1fbceba`):** apps *SafeWalk (iOS)* (`nl.safewalk.app`),
*SafeWalk (Android)* (`nl.safewalk.app`) en *Test Store*; entitlement `premium`; offering `default` (current) met
package `$rc_monthly` → producten `safewalk_premium_monthly` (iOS), `safewalk_premium:monthly` (Play, productId:basePlanId)
en `safewalk_premium_monthly_test` (Test Store). Webhook *SafeWalk Convex prod* → `https://agile-capybara-401.convex.site/revenuecat/webhook`.
Publieke SDK-sleutels staan in `eas.json` en `.env.example`. `REVENUECAT_WEBHOOK_SECRET` staat op dev en prod (waarde alleen in het lokale, niet-gecommitte `.env.cloud`).
Nog handmatig: de Authorization-header van de webhook in het RC-dashboard op `Bearer <secret>` zetten, de producten in App Store Connect / Play Console aanmaken (€2,99/maand) en de store-credentials in RevenueCat koppelen.

### Adminpaneel
```bash
cd admin && cp .env.example .env   # VITE_CONVEX_URL
npm run dev                        # of npm run build → dist/ (statisch hosten, bv. achter toegangsbeveiliging)
```

## Juridisch
Privacybeleid en gebruiksvoorwaarden (`docs/`, in de app via `node scripts/sync-legal.mjs`) zijn ingevuld voor **Vonk Byte** (support@vonkbyte.nl, KvK volgt januari 2027, geen adres). **Juridische toetsing (AVG) staat nog open** – laat de teksten controleren vóór publicatie en vul daarna het KvK-nummer in.

## Store-voorbereiding
- `app.json`: Nederlandstalige permissieteksten (`NSLocationWhenInUse…`, `NSLocationAlwaysAndWhenInUse…`, `UIBackgroundModes: location, remote-notification`), Android foreground-service-permissies, iconen/splash (placeholders in merkkleuren in `assets/`).
- `eas.json`: `development`, `preview`, `production` (+ submit-placeholders).
- `docs/privacybeleid.md`, `docs/gebruiksvoorwaarden.md` (concepten, juridisch laten toetsen), `docs/store-listing.md` (NL/EN), `docs/data-safety.md` (Play Data safety + Apple App Privacy).

## Tests
- `npm test` – Jest: versheid locatie, check-in-fases, validatie, uitnodigingslinks, afstand/ETA, offline-wachtrij.
- `npm run test:convex` – convex-test + Vitest: ongeautoriseerde/anonieme/admin-toegang, niet-gekozen contact, intrekken, verwijderen, beëindigde/verlopen sessies, blokkeren/deblokkeren, beperkte accounts, contactlimiet, SOS (push, receipts verstuurd/mislukt/onbekend, retry, idempotentie, vals alarm, rate limit), alle reis-meldingen, check-in (herinnering, escalatie, respijt, verlengen), bewegingsdetectie, RevenueCat-webhook en feature gating, AI-assistent (uitgeschakeld/premium/112-tekst), adminpaneel zonder locatiedata, retentie, accountverwijdering. Externe diensten (Expo, OpenAI) worden gemockt.

## Beperkingen iOS/Android (belangrijk)
- **Achtergrondlocatie is niet gegarandeerd.** iOS kan updates vertragen/pauzeren; gebruikers kunnen "Altijd" weigeren. Android-fabrikanten beëindigen achtergrondprocessen bij batterijbesparing. Android toont een permanente melding.
- GPS kan onnauwkeurig zijn; de app toont nauwkeurigheid en waarschuwt bij verouderde (>2 min) of ontbrekende (>10 min) data.
- **Push is niet gegarandeerd.** "Verstuurd – bevestigd door pushdienst" betekent overgedragen aan Apple/Google, niet gelezen. Niet storen, geen internet of uitgeschakelde meldingen kunnen aflevering verhinderen.
- Puur tijdgebaseerd verlopen wordt binnen ±1 min door de cron gepusht; nieuwe verzoeken worden direct geweigerd.
- ETA is een ruwe schatting (hemelsbreed × 1,3, loopsnelheid); er is geen routeplanner en geen uitspraak over veilige routes.
- Test op echte toestellen.

## Nog te doen
- Echte iconen/screenshots, juridische toetsing van docs, App Store/Play-accounts en producten.
- E-mailverificatie/wachtwoordreset (Convex Auth + e-mailprovider).
- E2E-tests op toestellen (Maestro/Detox), lokalisatie EN in de app.
