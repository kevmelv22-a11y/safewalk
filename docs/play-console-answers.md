# Play Console — voorstel op basis van de bron

Tak `cursor/safety-code-offerings-b186`, commit van de leeftijdspoort en verwijdering, plus deze pagina's. Geen indiening gedaan. Onzekere punten staan bij **Kevin**.

Feature graphic 1024×500: niet aanwezig in `assets/` (alleen icon, adaptive icon, splash, notification, favicon, logo-full). Niet gegenereerd. Specificatie als die nog gemaakt wordt: 1024×500 px, PNG, geen transparantie, achtergrond `#08090E`, accent `#AE16C7`, naam SafeWalk, één regel "Deel je reis met vertrouwde contacten". Geen 112-belofte, geen nepfoto van een noodgeval.

## Privacybeleid-URL

Placeholder tot de HTML online staat: `https://<host>/privacy.html`. Bestand: `public-pages/privacy.html`. De app toont dezelfde inhoud via Instellingen → Privacybeleid (`docs/privacybeleid.md`, `src/content/legal.ts`).

## Inloggegevens / app-access

De app heeft een account nodig. Reviewer-account moet **Kevin** aanmaken. Geen account hier aangemaakt.

Instructie voor de reviewer, pas na dat account:

1. Open SafeWalk, maak geen account jonger dan 16.
2. Log in met het testaccount.
3. Geboortejaar bijvoorbeeld 1990, maand 1. Onder 16 blijven locatie, contacten, opnames, aankopen en de assistent dicht (`convex/age.ts`, `convex/lib.ts` `requireAdult`).
4. 2FA: niet in de app zelf. Alleen als het e-mailaccount van de reviewer dat heeft.

## Contentclassificatie (IARC)

Voorstel, geen ingevuld formulier:

- Geweld, seks, grof taalgebruik, drugs, gokken als inhoud van de app: niet aanwezig in de bron.
- Gebruikersinteractie: ja. Uitnodiging, meekijken, blokkeren (`convex/contacts.ts`).
- Locatie delen met anderen: ja (`src/lib/location.ts`, `convex/sessions.ts`).
- Digitale aankoop: ja, abonnement via Play (`react-native-purchases`, `convex/billing.ts`).
- **Kevin:** de vragen over user-generated audio (een opname kan het alarm bevatten) en vrije tekst in een misbruikmelding. De app heeft geen open chat.

## Doelgroep en content

Voorgestelde doelgroep: 13+. Geen kindgerichte app.

- Onder 13: geweigerd (`AGE_UNDER_13`).
- 13–15: app opent, gevoelige functies dicht zolang oudercontrole ontbreekt (`docs/privacybeleid.md` sectie 7).
- 16+: functies aan.
- Geen advertentie-SDK in `package.json`.
- **Kevin:** Play kan bij een gemengde doelgroep extra eisen stellen (Families-beleid). Locatiepermissie staat in `app.json` voor de app als geheel. De bron vraagt locatie pas in de flow vanaf 16, maar het manifest vraagt de permissie wel. Of dat voor de gekozen doelgroep mag, is niet hier beslist.

## Veiligheid van gegevens

Verzameld: ja. Verkoop: nee. Advertenties: nee.

| Type | Verzameld | Gedeeld | Verplicht of optioneel | Doel |
|---|---|---|---|---|
| Precieze locatie, ook achtergrond tijdens een gestarte reis | Ja | Met gekozen contacten en met wie een geldige link heeft | Optioneel, uit onder 16 | App-functionaliteit |
| Naam, e-mail | Ja | Verwerker Convex; code-mail via Resend als die aan staat | Nodig voor account | Accountbeheer |
| Geboortejaar en -maand | Ja | Convex | Nodig om verder te gaan | Accountbeheer |
| Opname | Ja, ciphertext | Convex; gekozen contact met sleutel; optioneel via link | Optioneel | App-functionaliteit |
| Contacten uit het adresboek (naam, nummer) | Alleen na toestemming en aanvinken | Convex | Optioneel | App-functionaliteit |
| In-app berichten (AI) | Alleen als de assistent aan staat | OpenAI. Niet in onze database bewaard | Optioneel | App-functionaliteit |
| Aankoopstatus | Ja | RevenueCat, Google Play | Optioneel | App-functionaliteit |
| Pushtoken | Ja | Expo, daarna Apple of Google | Optioneel | App-functionaliteit |
| Fout- en auditregels | Ja, als ze ontstaan | Convex, admin | Niet een verplichte crash-SDK | Beveiliging. Geen Sentry of Firebase Analytics in `package.json` |

Versleuteld onderweg: HTTPS naar Convex, Expo, OpenAI en Resend, voor zover de code die URL's gebruikt. Geen aparte audit van certificaten.

Verwijderverzoek: ja, in de app, en per mail zoals `public-pages/account-verwijderen.html`. De URL werkt pas nadat de pagina gehost is.

Advertentie-ID: `AD_ID` komt niet voor in `app.json` of de app-bron. `node_modules` stond hier niet, en het AAB is niet uitgepakt. **Kevin:** controleer in de gebouwde manifest of Play Services het recht alsnog toevoegt. Tot die controle: niet als "verzameld" invullen en niet hard ontkennen.

## Overheidsapps

Nee. Geen overheidslogo, geen overheidsaanbieder. Aanbieder in de tekst: Vonk Byte.

## Financiële functies

Abonnement Premium via Google Play Billing, gekoppeld door RevenueCat (`src/lib/purchases.ts`, `convex/billing.ts`). Geen bank, lening of crypto in de bron. De prijs komt uit de winkel, niet uit een vast bedrag in deze tak.

**Kevin:** of Play de vraag "financiële functies" ook voor een gewoon abonnement aanvinkt. Inhoud is een abonnement, geen financiële dienst.

## Gezondheidsapps

Geen medische diagnose, geen gezondheidsdossier. Wel een veiligheidsfunctie: SOS waarschuwt contacten en deelt een laatst bekende locatie als die is meegestuurd. De app belt niet zelf 112 (`docs/privacybeleid.md` sectie 1, `convex/sos.ts`).

**Kevin:** of de Console dit onder gezondheid of veiligheid schaart. De bron noemt het een persoonlijke veiligheidsapp, geen medische app.
