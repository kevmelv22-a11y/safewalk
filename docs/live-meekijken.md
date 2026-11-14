# Live meekijken 2.0 – wat er is, wat nog getest moet worden, wat goedkeuring nodig heeft

Status: code + tests klaar op branch `cursor/live-meekijken`. **Niet gedeployd, niet gebouwd, niets gepubliceerd.**

## Functies
| # | Functie | Waar |
|---|---|---|
| 1 | Locatie op de achtergrond tijdens een reis/timer (Android-voorgronddienst met vaste melding, iOS met blauwe indicator). Alleen tussen start en stop; eigen stopgrens (`expiresAt` + 5 min, max 24 u); taak stopt zichzelf zonder lokale reis. Terugval op "alleen met app open" als de dienst niet start. Uitlegscherm vóór de toestemmingsvraag. | `src/lib/location.ts`, `src/lib/sharingKeeper.tsx`, `src/components/LiveDisclosure.tsx` |
| 2 | Reis/timer met alleen een link (geen app-contact nodig). Kijkers kunnen browsermeldingen (alleen zolang de pagina open is) en/of e-mail (dubbele opt-in, afmelden met één klik, `List-Unsubscribe`) aanzetten voor SOS, gemiste check-in, aankomst, lage batterij, niet meer live. Limieten: 5 adressen per link, 12 mails per adres, 10 aanvragen/u per link, 5/dag per adres, 80 kijkersmails/dag totaal. Escalatie via de bestaande cron (`checkDeadlines`, elke minuut). | `convex/viewerAlerts.ts`, `convex/tracking.ts`, `convex/http.ts` |
| 3 | Meekijkpagina 2.0: route (laatste 60 min), bestemming, nauwkeurigheidscirkel, "Navigeer naar mij" (Google Maps / Apple Kaarten), duurkeuze (15 min / 1 u / tot aankomst / 8 u; server max 24 u), "link = sleutel"-waarschuwing, zichtbare intrekknop per link in de app. | `convex/trackPage.ts`, `app/session/[id].tsx`, `app/share-link.tsx` |
| 4 | Privacy-check-in: kijkers zien alleen status; locatie/batterij/route pas bij gemiste check-in of SOS. | `convex/liveShare.ts#revealDetails`, `convex/sessions.ts` |
| 5 | Timer zonder bestemming (bv. "Date", 15 min – 3 u). | `app/session/new.tsx`, `convex/sessions.ts#startCore` |
| 6 | Optionele toegangscode (6 cijfers, PBKDF2-hash met zout, 5 pogingen per 15 min, blokkade na 20 fouten). | `convex/linkAccess.ts`, `/track/unlock` |
| 7 | Signalen batterij ≤ 15 % (één keer per reis, niet in privacymodus) en "niet meer live" (> 10 min geen punt, max 3 keer). Push naar app-kijkers + e-mail naar link-kijkers. | `convex/sessions.ts#addLocation`, `convex/monitor.ts` |
| 8 | Schudden voor SOS: opt-in in Instellingen, hoge drempel (4 pieken ≥ 2,7 g binnen 1,5 s), 30 s afkoeltijd, altijd ≥ 5 s annuleer-aftelling. Alleen met app open. | `src/lib/shake.ts`, `src/components/ShakeSosListener.tsx`, `app/sos.tsx` |

Alles blijft 16+ (`requireAdult`); 13–15 blijft dicht. Geen paywall-wijziging (alles gratis; beslissing voor Kevin).

## Rechten (app.json)
- Toegevoegd: `FOREGROUND_SERVICE_LOCATION` (nodig voor de locatie-voorgronddienst op Android 14+).
- Blijft geblokkeerd: `ACCESS_BACKGROUND_LOCATION`. Niet nodig: de voorgronddienst wordt gestart terwijl de app open is (gecontroleerd in expo-location `LocationModule.kt`).
- Nieuw geblokkeerd: `ACTIVITY_RECOGNITION` (komt mee met expo-sensors, alleen voor de stappenteller; die gebruiken we niet).
- `expo-sensors` met `motionPermission: false` (accelerometer heeft op iOS geen toestemming nodig).
- iOS: `UIBackgroundModes: location` stond er al; de "Altijd"-teksten worden nu ook via de plugin gezet. De app vraagt nooit "Altijd".

## Nodig vóór een release (goedkeuring Kevin)
1. **Convex productie-deploy** (`agile-capybara-401`) – schema-uitbreiding (nieuwe tabellen `linkGrants`, `viewerSubscriptions`, nieuwe optionele velden). Eerst deployen, dan pas bouwen: een nieuwe app tegen een oude backend faalt op `sessions.begin`.
2. **Resend**: `RESEND_API_KEY` staat al voor inlogcodes. Voor kijkersmails is een geverifieerd afzenderdomein nodig (`AUTH_EMAIL_FROM`, bv. `SafeWalk <meldingen@vonkbyte.nl>`); met `onboarding@resend.dev` komen mails alleen bij de eigenaar van het Resend-account aan. Gratis tier = 100 mails/dag, 3.000/maand; de app stopt zelf bij 80 kijkersmails/dag.
3. **EAS-build** (~$1) – pas na 1.
4. **Google Play – voorgronddienst-verklaring**: Play Console → App-content → "Rechten voor voorgrondservices" → type *Locatie*. Uitleg + **video** (≤ 30 s): reis starten → uitlegscherm → toestemming "Tijdens gebruik" → melding "SafeWalk deelt je locatie" → scherm uit → kijker ziet updates → reis stoppen → melding weg. Geen achtergrondlocatie-verklaring nodig (recht blijft geblokkeerd).
5. **Data safety / App Privacy / privacybeleid** – zie hieronder; nog niet aangepast in `docs/data-safety.md` en `docs/privacybeleid.md`.

## Voorstel tekstwijzigingen (NIET gepubliceerd)
**Data safety (Play)**
- Locatie: "Ja (tijdens een reis, timer, SOS of incident die de gebruiker zelf start; ook met scherm uit via een zichtbare melding)" i.p.v. "alleen terwijl de app open is".
- Regel "Achtergrondlocatie: niet van toepassing" aanpassen: nog steeds geen `ACCESS_BACKGROUND_LOCATION`, maar wel een locatie-voorgronddienst (aparte verklaring, zie 4).
- Nieuw: *Persoonlijke info → E-mailadres* van **kijkers** (niet-gebruikers) die zich zelf aanmelden voor meldingen. Doel: app-functionaliteit. Optioneel. Verwerker: Resend.

**Apple App Privacy**: "Email Address" dekt dit al (App Functionality); "Precise Location" blijft.

**Privacybeleid** (tabel + §3):
- Nieuwe rij: *E-mailadres van een kijker die meldingen aanvraagt via een meekijklink* – doel: meldingen bij SOS, gemiste check-in, aankomst, lage batterij, niet meer live – grondslag: toestemming (dubbele opt-in) – bewaartermijn: tot afmelden, aankomst/einde van de reis, of verlopen/intrekken van de link (bij intrekken meteen, anders binnen ±15 min; een link duurt max. 24 u); onbevestigd: na 24 u gewist. Opgeslagen: adres, een hash ervan, status, tijdstippen, welke meldingen verstuurd zijn.
- Toegangscode: alleen een gezouten hash, nooit de code zelf.
- §3 "Wie je locatie kan zien": aanvullen met "iedereen die jouw meekijklink (en eventueel de code) heeft, zolang de link geldig is" en "e-mails aan kijkers bevatten bij SOS of gemiste check-in je laatst bekende locatie (kaartlink) en batterij, nooit je naam".
- Lijst verwerkers: Resend ook voor "meldingen aan kijkers die zich daarvoor aanmelden".
- Locatie op de achtergrond: "ook met scherm uit tijdens een reis of timer die je zelf start, met een vaste melding; stopt bij beëindigen, aankomst, verlopen of wegvegen van de app".

## Getest
- `npm run typecheck`, `npx eslint .`, `npx jest` (176), `npx vitest run` (123) – alles groen.
- Backend: 23 nieuwe convex-tests (`convex/liveMeekijken.test.ts`): link-only, timer, duur, code (pogingen/blokkade), privacy, signalen, e-mail opt-in/afmelden/limieten, intrekken, accountverwijdering, HTTP-routes.
- App: 25 nieuwe jest-tests (`__tests__/liveMeekijken.test.ts`): start/stop achtergrondtaak, terugval, stopgrens, batch-keuze, schuddetector, startvalidatie, teksten, app.json-rechten.
- Meekijkpagina: echte HTML + JSON uit de backend (convex-test) in Chrome (mobiel formaat) met de echte CSP; screenshots in `/workspace/safewalk-live-shots/`.
- App-schermen: Expo web met gemockte Convex-data (screenshots `app-*.png`); op web is er geen achtergrondlocatie/schudden.

## NIET getest (moet op een toestel)
- Achtergrondlocatie op echte Android 14/15 en iPhone: melding zichtbaar, updates met scherm uit, batterijbesparing (Samsung/Xiaomi kunnen de dienst doden), stoppen bij aankomst/verlopen, gedrag na wegvegen.
- Starten vanuit een notificatie/terwijl de app net naar de achtergrond gaat (Android staat het starten van een voorgronddienst vanuit de achtergrond niet toe; de app valt dan terug).
- Schudden op echte hardware (drempel kan te hoog/laag zijn; afstellen na proef).
- Echte e-mailaflevering (spamfilters, One-Click-afmelden bij Gmail) – alleen met mock getest.
- Browsermeldingen op Android Chrome / iOS-PWA.

## Device-testplan (kort)
1. Android: reis met alleen link → uitleg → "Tijdens gebruik" → melding staat er → scherm 10 min uit → op tweede telefoon de link: punten lopen door → stop → melding weg, pagina "beëindigd".
2. Zelfde met wegvegen: pagina toont na ~10 min "niet meer live" en kijker met e-mail krijgt één mail.
3. Check-in laten verlopen → kijkerpagina rood + "Bel 112"-knop, e-mail "check-in gemist".
4. Privacy-check-in → kijker ziet geen kaart → laat check-in verlopen → kaart verschijnt.
5. Code-link: 5× fout → wacht-melding; juiste code → kaart.
6. Schudden aan in Instellingen → stevig schudden → SOS-aftelling ≥ 5 s → Annuleren.
7. Batterij < 15 % (of emulator) → één melding.
