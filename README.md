# SafeWalk – Samen veilig thuis (MVP)

Persoonlijke veiligheidsapp: deel je reis tijdelijk met vertrouwde contacten. Bevestig je niet op tijd dat je veilig bent aangekomen, dan waarschuwt de **server** je contacten.

> ⚠️ **SafeWalk is geen officiële hulpdienst.** De app belt 112 nooit automatisch en kan niet garanderen dat pushmeldingen aankomen. De 112-knop opent alleen de telefoon-app.

## Stack
Expo SDK 58 · Expo Router · TypeScript · Supabase (Auth, Postgres + RLS, Realtime, Edge Functions, pg_cron) · expo-location + expo-task-manager · expo-notifications · react-native-maps · Zustand · TanStack Query.

## Wat zit erin (MVP)
| Onderdeel | Waar |
|---|---|
| Onboarding: welkom, account, inloggen, locatie-, meldingentoestemming, contacten, veiligheidsinstellingen, dashboard | `app/` |
| Database, RLS, triggers, RPC's | `supabase/migrations/` |
| Uitnodigen via link (token alleen als SHA-256-hash opgeslagen, 7 dagen geldig), accepteren/weigeren, verwijderen, blokkeren, misbruik melden | `create_invitation`, `respond_invitation`, `app/contacts.tsx`, `app/invite/[token].tsx` |
| Veiligheidssessie met sessiespecifieke kijkers, voor- en achtergrondlocatie, offline-buffer, stoppen, kijker intrekken | `app/session/*`, `src/lib/location.ts` |
| Live kaart voor meekijker via Realtime met nauwkeurigheid, tijd van laatste update en waarschuwing bij verouderde data | `app/watch/[id].tsx`, `src/components/LiveMap.tsx` |
| SOS: aftelling met annuleren, incident, push naar contacten met laatste locatie, status per ontvanger, offline-wachtrij met retry (idempotent via `client_ref`), "vals alarm", tel:112-knop | `app/sos.tsx`, `src/lib/sos.ts`, `supabase/functions/sos-alert` |
| Check-in: deadline + respijt in de database; `check-deadlines` (pg_cron elke minuut) escaleert; app vraagt "Alles goed?" met verlengen (max 3×) | `respond_check_in`, `escalate_missed_check_ins`, `supabase/functions/check-deadlines` |
| Rate limiting (DB-functie), audit logs, account verwijderen | `check_rate_limit`, `audit_logs`, `supabase/functions/delete-account` |
| Bewaarbeleid: locaties 24 u na einde reis verwijderd (vangnet 3 dagen), alert-coördinaten na 30 dagen gewist | `purge_old_locations` (pg_cron, elk kwartier) |

### Privacymodel (server-side afgedwongen)
- Een kijker ziet `location_updates` alleen als: geaccepteerd vertrouwd contact **én** expliciet toegevoegd aan **deze** sessie **én** sessie actief en niet verlopen **én** toegang niet ingetrokken **én** geen blokkade (`can_view_session`).
- Contact verwijderen, blokkeren, sessie beëindigen of laten verlopen trekt toegang direct in.
- Gratis: max. 2 contacten, afgedwongen door een trigger (premium: 20).
- Beheerders (`admins`) kunnen misbruikmeldingen/audit-logs lezen maar **geen locaties**.
- Sessies hebben een harde vervaltijd (verwachte aankomst + 2 u, max. 12 u reis).

## Installatie
```bash
npm install
cp .env.example .env    # vul Supabase URL + anon key in
npm run typecheck && npm test && npm run test:sql
```

### Supabase
```bash
supabase link --project-ref <ref>
supabase db push                                   # migraties
supabase secrets set CRON_SECRET=<random> EXPO_ACCESS_TOKEN=<optioneel>
supabase functions deploy sos-alert check-deadlines delete-account
```
Voor de minuut-cron: schakel `pg_cron` en `pg_net` in en zet in Vault:
```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<zelfde CRON_SECRET>', 'cron_secret');
```
Draai de tweede migratie opnieuw (of de `cron.schedule`-aanroepen) als pg_cron pas later is ingeschakeld. Zet in Auth de redirect/deeplink `safewalk://`.

### App draaien (development build vereist)
Achtergrondlocatie, TaskManager en push werken **niet** in Expo Go.
```bash
npx eas build --profile development --platform android   # of ios
npx expo start --dev-client
```
Vul `extra.eas.projectId` in `app.json` (nodig voor Expo push tokens) en `GOOGLE_MAPS_ANDROID_API_KEY`.

## Tests
- `npm test` – Jest-unittests voor clientlogica (versheid locatie, check-in-fases, validatie, uitnodigingslinks, offline-wachtrij met backoff).
- `npm run test:sql` – 15 RLS/SQL-tests op echte Postgres (PGlite, in-process): ongeautoriseerde toegang, anon, admin, intrekken, verwijderen, verlopen/beëindigde sessies, contactlimiet, blokkeren, escalatie, retentie, rate limiting. Supabase-specifieke delen (auth-schema, pg_cron) worden gestubd.

## Beperkingen iOS/Android (belangrijk)
- **Achtergrondlocatie is niet gegarandeerd.** iOS kan updates vertragen/pauzeren; de gebruiker kan "Altijd" weigeren of later intrekken. Android-fabrikanten (Samsung, Xiaomi, Huawei…) beëindigen achtergrondprocessen agressief bij batterijbesparing. Android toont een permanente melding (foreground service).
- GPS kan binnen, in tunnels of tussen hoge gebouwen onnauwkeurig zijn; de app toont de nauwkeurigheid en waarschuwt bij verouderde data (>2 min) of geen data (>10 min).
- **Push is niet gegarandeerd.** "Verstuurd" betekent: geaccepteerd door de Expo-pushdienst, niet afgeleverd. Niet storen, stille modus, geen internet of uitgeschakelde meldingen kunnen aflevering verhinderen. Push-receipts worden nog niet opgehaald.
- Als de telefoon uit/offline is, blijft de server de check-in-deadline bewaken en waarschuwt contacten – maar zonder recente locatie.
- Test op echte iOS- en Android-toestellen; simulators geven geen realistisch beeld.

## Nog te doen
- **Premium / RevenueCat** (`react-native-purchases` is geïnstalleerd, nog niet geconfigureerd) + webhook die `subscriptions` bijwerkt.
- **AI-veiligheidsassistent** (OpenAI, optioneel, los van SOS/check-in).
- **Bewegingsdetectie** (langdurig stilstaan, routeafwijking, geen data → alleen extra check-in aanbieden).
- **Adminpaneel** (gebruikers, misbruikmeldingen, beperkingen, geanonimiseerde statistieken) – tabellen/RLS bestaan al.
- Bestemming kiezen op kaart/geocoding, ETA-berekening, notificaties "sessie gestart/bijna aangekomen/beëindigd", push-receipts, e2e-tests (Maestro/Detox), App Store-assets & privacylabels, typed DB-types (`supabase gen types`).
