# Google Play Data safety & Apple App Privacy – antwoorden (concept)

## Google Play – Data safety
- **Verzamelt of deelt de app gegevens?** Ja (verzamelen). Gedeeld met derden: nee (alleen met verwerkers en met door de gebruiker gekozen contacten op diens verzoek; dit valt onder "user-initiated sharing" en hoeft niet als delen te worden opgegeven).
- **Versleuteld tijdens overdracht:** Ja. **Gebruiker kan verwijdering aanvragen:** Ja (in-app accountverwijdering + [URL webformulier]).
| Categorie | Type | Verzameld | Verplicht/optioneel | Doel |
|---|---|---|---|---|
| Locatie | Precieze locatie | Ja (ook op achtergrond tijdens reis) | Optioneel (vereist voor delen) | App-functionaliteit |
| Persoonlijke info | Naam, e-mailadres | Ja | Verplicht | Accountbeheer |
| Financiële info | Aankoopgeschiedenis | Ja (via store/RevenueCat) | Optioneel | App-functionaliteit |
| Berichten | Overige in-app berichten (AI-vragen) | Ja, niet opgeslagen | Optioneel | App-functionaliteit |
| App-activiteit | Overige acties (misbruikmeldingen) | Ja | Optioneel | Fraude/misbruikpreventie |
| App-info en prestaties | Crashlogs/diagnose (foutmeldingen) | Ja | Verplicht | Analyse (stabiliteit) |
| Apparaat-ID's | Pushtoken | Ja | Optioneel | App-functionaliteit |
- **Achtergrondlocatie-verklaring (Play Console):** "SafeWalk deelt tijdens een door de gebruiker gestarte reis de locatie met door de gebruiker gekozen vertrouwde contacten, ook als het scherm uit is, zodat zij kunnen meekijken en bij een gemiste check-in de laatste locatie ontvangen. Delen stopt wanneer de gebruiker de reis beëindigt." Video van de flow toevoegen.

## Apple – App Privacy ("Data Linked to You")
| Data type | Gebruik | Gekoppeld aan gebruiker | Tracking |
|---|---|---|---|
| Precise Location | App Functionality | Ja | Nee |
| Name, Email Address | App Functionality | Ja | Nee |
| Purchase History | App Functionality | Ja | Nee |
| Other User Content (AI-vragen, meldingen) | App Functionality | Ja | Nee |
| Crash/Other Diagnostic Data | App Functionality | Nee | Nee |
| Device ID (push token) | App Functionality | Ja | Nee |
- **Tracking:** Nee (geen ATT-prompt nodig). **Privacybeleid-URL:** [https://…/privacy].
- **Account deletion:** in-app aanwezig (Instellingen → Account verwijderen) – vereist door App Store-richtlijn 5.1.1(v).
