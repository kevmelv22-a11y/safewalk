# SafeWalk – Samen veilig thuis (MVP)

Persoonlijke veiligheidsapp: deel je reis tijdelijk met vertrouwde contacten. Bevestig je niet op tijd dat je veilig bent aangekomen, dan waarschuwt de **server** je contacten.

> ⚠️ **SafeWalk is geen officiële hulpdienst.** De app belt 112 nooit automatisch en kan niet garanderen dat pushmeldingen aankomen. De 112-knop opent alleen de telefoon-app.

## Stack
Expo SDK 58 · Expo Router · TypeScript · **Convex** (database, reactieve queries, mutations, actions, crons/scheduler) · **Convex Auth** (wachtwoord) · expo-location + expo-task-manager · expo-notifications · react-native-maps · Zustand.

## Wat zit erin (MVP)
| Onderdeel | Waar |
|---|---|
| Onboarding: welkom, account, inloggen, locatie-, meldingentoestemming, contacten, veiligheidsinstellingen, dashboard | `app/` |
| Schema + indexen | `convex/schema.ts` |
| Toegangscontrole (vervangt RLS) | `convex/lib.ts` → `canViewSession` |
| Uitnodigen via link (token alleen als SHA-256-hash opgeslagen, 7 dagen geldig), accepteren/weigeren, verwijderen, blokkeren, misbruik melden | `convex/contacts.ts`, `app/contacts.tsx`, `app/invite/[token].tsx` |
| Veiligheidssessie met sessiespecifieke kijkers, voor- en achtergrondlocatie met offline-buffer, stoppen, kijker intrekken | `convex/sessions.ts`, `app/session/*`, `src/lib/location.ts` |
| Live kaart via reactieve Convex-query met nauwkeurigheid, tijd laatste update, waarschuwing bij verouderde data | `app/watch/[id].tsx`, `src/components/LiveMap.tsx` |
| SOS: aftelling + annuleren, incident, Expo push (action) met laatste locatie, status per ontvanger, retries (3×), offline-wachtrij (idempotent via `clientRef`), "vals alarm", tel:112-knop | `convex/sos.ts`, `convex/push.ts`, `app/sos.tsx`, `src/lib/sos.ts` |
| Check-in: deadline + respijt op de server; cron elke minuut escaleert gemiste check-ins en sluit verlopen sessies; app vraagt "Alles goed?" met verlengen (max 3×) | `convex/monitor.ts`, `convex/crons.ts` |
| Rate limiting, audit logs, account verwijderen, eigen locatiegeschiedenis verwijderen | `convex/lib.ts`, `convex/account.ts`, `convex/sessions.ts` |
| Bewaarbeleid: locaties 24 u na einde reis verwijderd (vangnet 3 dagen), alert-coördinaten na 30 dagen gewist | `monitor.purge` (cron, elk kwartier) |

### Privacymodel (server-side afgedwongen in Convex-functies)
Convex heeft geen RLS; **alle** data loopt via functies in `convex/` en elke functie controleert zelf de ingelogde gebruiker. Er zijn geen publieke functies die ruwe tabellen teruggeven.
- Een kijker krijgt locaties alleen als: geaccepteerd vertrouwd contact **én** expliciet toegevoegd aan **deze** sessie **én** sessie actief en niet verlopen (`expiresAt` wordt bij elke query gecontroleerd) **én** toegang niet ingetrokken **én** geen blokkade.
- Contact verwijderen, blokkeren, sessie beëindigen of verlopen trekt toegang direct in; reactieve queries geven dan meteen een lege lijst/`null`. (Puur tijd-gebaseerd verlopen wordt binnen ±1 minuut door de cron naar de client gepusht.)
- Gratis: max. 2 contacten, gecontroleerd in de accept-mutation (transactioneel); premium: 20.
- Beheerders (`admins`) kunnen misbruikmeldingen lezen; er bestaat **geen** admin-route naar locaties.

## Installatie (lokaal, zonder account)
```bash
npm install
CONVEX_AGENT_MODE=anonymous npx convex dev --local   # start lokale Convex-backend en schrijft .env.local
npx @convex-dev/auth                                  # eenmalig: auth-sleutels in de deployment
npm run typecheck && npm test && npm run test:convex
```

## Deployen naar Convex Cloud (gratis tier)
1. `npx convex login` (maakt/gebruikt een Convex-account – vereist jouw actie).
2. `npx convex dev` → kies "create a new project" (dev-deployment), of `npx convex deploy` voor productie.
3. `npx @convex-dev/auth` → zet `JWT_PRIVATE_KEY`, `JWKS` en `SITE_URL` op de deployment.
4. Optioneel: `npx convex env set EXPO_ACCESS_TOKEN <token>`.
5. Zet `EXPO_PUBLIC_CONVEX_URL` (https://<naam>.convex.cloud) in `.env` / EAS-secrets. Crons starten automatisch na deploy.

### App draaien (development build vereist)
Achtergrondlocatie, TaskManager en push werken **niet** in Expo Go.
```bash
npx eas build --profile development --platform android   # of ios
npx expo start --dev-client
```
Vul `extra.eas.projectId` in `app.json` (nodig voor Expo push tokens) en `GOOGLE_MAPS_ANDROID_API_KEY`.

## Tests
- `npm test` – Jest-unittests voor clientlogica (versheid locatie, check-in-fases, validatie, uitnodigingslinks, offline-wachtrij met backoff).
- `npm run test:convex` – 21 server-side tests met `convex-test` + Vitest: ongeautoriseerde/anonieme/admin-toegang, niet-gekozen contact, schrijven in andermans sessie, intrekken, verwijderen, beëindigde en verlopen sessies, blokkeren, contactlimiet, SOS (push, status per ontvanger, retry, idempotentie, annuleren, rate limit), gemiste check-in + respijt + verlengen, retentie, admin, account verwijderen. Expo push wordt gemockt.

## Beperkingen iOS/Android (belangrijk)
- **Achtergrondlocatie is niet gegarandeerd.** iOS kan updates vertragen/pauzeren; de gebruiker kan "Altijd" weigeren of later intrekken. Android-fabrikanten (Samsung, Xiaomi, Huawei…) beëindigen achtergrondprocessen agressief bij batterijbesparing. Android toont een permanente melding (foreground service).
- GPS kan binnen, in tunnels of tussen hoge gebouwen onnauwkeurig zijn; de app toont de nauwkeurigheid en waarschuwt bij verouderde data (>2 min) of geen data (>10 min).
- **Push is niet gegarandeerd.** "Verstuurd" betekent: geaccepteerd door de Expo-pushdienst, niet afgeleverd. Niet storen, stille modus, geen internet of uitgeschakelde meldingen kunnen aflevering verhinderen. Push-receipts worden nog niet opgehaald.
- Als de telefoon uit/offline is, blijft de server (Convex-cron) de check-in-deadline bewaken en waarschuwt contacten – maar zonder recente locatie.
- Test op echte iOS- en Android-toestellen; simulators geven geen realistisch beeld.

## Nog te doen
- **Premium / RevenueCat** (`react-native-purchases` is geïnstalleerd, nog niet geconfigureerd) + Convex HTTP-webhook die `subscriptions` bijwerkt.
- **AI-veiligheidsassistent** (OpenAI, optioneel, los van SOS/check-in).
- **Bewegingsdetectie** (langdurig stilstaan, routeafwijking, geen data → alleen extra check-in aanbieden).
- **Adminpaneel** (gebruikers, misbruikmeldingen, beperkingen, geanonimiseerde statistieken) – tabellen/RLS bestaan al.
- Bestemming kiezen op kaart/geocoding, ETA-berekening, notificaties "sessie gestart/bijna aangekomen/beëindigd", push-receipts, e2e-tests (Maestro/Detox), App Store-assets & privacylabels, e-mailverificatie/wachtwoordreset in Convex Auth.
