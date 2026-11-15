# Google Play Data safety & Apple App Privacy – antwoorden (concept)

## Google Play – Data safety
- **Verzamelt of deelt de app gegevens?** Ja (verzamelen). Gedeeld met derden: nee (alleen met verwerkers en met door de gebruiker gekozen contacten op diens verzoek; dit valt onder "user-initiated sharing" en hoeft niet als delen te worden opgegeven).
- **Versleuteld tijdens overdracht:** Ja. **Gebruiker kan verwijdering aanvragen:** Ja (in-app accountverwijdering of per e-mail via support@vonkbyte.nl).
| Categorie | Type | Verzameld | Verplicht/optioneel | Doel |
|---|---|---|---|---|
| Locatie | Precieze locatie | Ja (alleen tijdens een reis, timer, SOS of incident die de gebruiker zelf start; tijdens een reis/timer ook met scherm uit via een zichtbare voorgrondmelding) | Optioneel (vereist voor delen) | App-functionaliteit |
| Persoonlijke info | Naam, e-mailadres | Ja | Verplicht | Accountbeheer |
| Persoonlijke info | Ritgegevens die de gebruiker zelf invult (kenteken, naam chauffeur, voertuig) | Ja, alleen tijdens een zelf gestarte reis; gewist bij einde reis | Optioneel | App-functionaliteit (delen met gekozen kijkers) |
| Persoonlijke info | E-mailadres van kijkers (ook niet-gebruikers) die via een meekijklink zelf meldingen aanvragen | Ja (dubbele opt-in; gewist na afmelden, einde reis, verlopen/intrekken van de link, of na 24 u als niet bevestigd) | Optioneel | App-functionaliteit (meldingen) |
| Financiële info | Aankoopgeschiedenis | Ja (via store/RevenueCat) | Optioneel | App-functionaliteit |
| Berichten | Overige in-app berichten (AI-vragen) | Ja, niet opgeslagen | Optioneel | App-functionaliteit |
| App-activiteit | Overige acties (misbruikmeldingen) | Ja | Optioneel | Fraude/misbruikpreventie |
| App-info en prestaties | Crashlogs/diagnose (foutmeldingen) | Ja | Verplicht | Analyse (stabiliteit) |
| Apparaat-ID's | Pushtoken | Ja | Optioneel | App-functionaliteit |
- **Achtergrondlocatie (Play Console):** nog steeds niet van toepassing: `ACCESS_BACKGROUND_LOCATION` blijft geblokkeerd in `app.json`. Sinds versionCode 8 deelt de app tijdens een zelf gestarte reis of timer wel locatie met scherm uit, via een **locatie-voorgronddienst** (`FOREGROUND_SERVICE_LOCATION`) met vaste melding "SafeWalk deelt je locatie". Die dienst start altijd terwijl de app open is. Daarvoor is in Play Console de verklaring **Rechten voor voorgrondservices → Locatie** nodig (met video), géén achtergrondlocatie-verklaring.
- **iOS:** `UIBackgroundModes: location` wordt nu gebruikt (delen met scherm uit tijdens een reis, blauwe indicator). De app vraagt alleen "Tijdens gebruik", nooit "Altijd".
- **Verwerker e-mail:** Resend verstuurt inlogcodes én e-mails aan kijkers die zich aanmelden.
- **Privacy-check-in:** kijkers zien alleen de status; locatie, route en batterij pas bij een gemiste check-in of SOS. De locatie wordt in die modus wel verzameld (zelfde bewaartermijn).
- **Dwangcode:** alleen een hash, net als de veiligheidscode (geen leesbare code). Bij gebruik gaat een SOS naar gekozen contacten; de app toont dat niet als succesvolle SOS aan de gebruiker.
- **Noodinfo:** alleen lokaal op het toestel, niet verzameld door SafeWalk (geen Data safety-categorie).
- **Plekken in de buurt:** op verzoek van de gebruiker gaat de locatie naar de OpenStreetMap Overpass API; SafeWalk slaat die zoekopdracht niet op. Dit is user-initiated sharing met een verwerker, geen achtergrondlocatie.
- **Sms als reserve:** de app opent alleen de systeem-composer; SafeWalk verstuurt geen sms en bewaart de berichttekst niet extra.
- **Schudden voor SOS:** accelerometer alleen lokaal, niets verzonden of opgeslagen (geen Data safety-categorie). `ACTIVITY_RECOGNITION` is geblokkeerd.

## Apple – App Privacy ("Data Linked to You")
| Data type | Gebruik | Gekoppeld aan gebruiker | Tracking |
|---|---|---|---|
| Precise Location | App Functionality | Ja | Nee |
| Name, Email Address | App Functionality | Ja | Nee |
| Purchase History | App Functionality | Ja | Nee |
| Other User Content (AI-vragen, meldingen) | App Functionality | Ja | Nee |
| Crash/Other Diagnostic Data | App Functionality | Nee | Nee |
| Device ID (push token) | App Functionality | Ja | Nee |
- **Tracking:** Nee (geen ATT-prompt nodig). **Privacybeleid-URL:** volgt (publiceer docs/privacybeleid.md op een openbare URL). Contact ontwikkelaar: Vonk Byte, support@vonkbyte.nl.
- **Account deletion:** in-app aanwezig (Instellingen → Account verwijderen) – vereist door App Store-richtlijn 5.1.1(v).
