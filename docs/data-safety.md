# Google Play Data safety & Apple App Privacy – antwoorden (concept)

## Google Play – Data safety
- **Verzamelt of deelt de app gegevens?** Ja (verzamelen). Gedeeld met derden: nee (alleen met verwerkers en met door de gebruiker gekozen contacten op diens verzoek; dit valt onder "user-initiated sharing" en hoeft niet als delen te worden opgegeven).
- **Versleuteld tijdens overdracht:** Ja. **Gebruiker kan verwijdering aanvragen:** Ja (in-app accountverwijdering of per e-mail via support@vonkbyte.nl).
| Categorie | Type | Verzameld | Verplicht/optioneel | Doel |
|---|---|---|---|---|
| Locatie | Precieze locatie | Ja (alleen terwijl de app open is, tijdens een reis, SOS of incident) | Optioneel (vereist voor delen) | App-functionaliteit |
| Persoonlijke info | Naam, e-mailadres | Ja | Verplicht | Accountbeheer |
| Financiële info | Aankoopgeschiedenis | Ja (via store/RevenueCat) | Optioneel | App-functionaliteit |
| Berichten | Overige in-app berichten (AI-vragen) | Ja, niet opgeslagen | Optioneel | App-functionaliteit |
| App-activiteit | Overige acties (misbruikmeldingen) | Ja | Optioneel | Fraude/misbruikpreventie |
| App-info en prestaties | Crashlogs/diagnose (foutmeldingen) | Ja | Verplicht | Analyse (stabiliteit) |
| Apparaat-ID's | Pushtoken | Ja | Optioneel | App-functionaliteit |
- **Achtergrondlocatie (Play Console):** niet van toepassing. Sinds versionCode 3 vraagt de Android-app geen `ACCESS_BACKGROUND_LOCATION` meer (geblokkeerd in `app.json`); locatie wordt alleen gedeeld terwijl SafeWalk open is. Er is dus geen achtergrondlocatie-verklaring of video nodig.
- **Let op iOS (nog open):** `app.json` heeft voor iOS nog `UIBackgroundModes: location` en "Always"-teksten. De code vraagt nooit "Altijd"-toestemming. Vóór een iOS-release die teksten en de achtergrondmodus gelijktrekken met het echte gedrag (alleen terwijl de app open is).

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
