# Groeifuncties: wat nog Kevins akkoord nodig heeft

Deze branch (`cursor/safewalk-groei-functies`) bevat alleen code. Er is niets gedeployd, gebouwd, samengevoegd of in Play/RevenueCat aangepast.

## 1. Volgorde (belangrijk)
1. **Eerst Convex productie deployen**, daarna pas build v7 uitrollen. De nieuwe app roept nieuwe serverfuncties aan (`referrals.mine`, `tracking.createTripLink`, `batteryPct` bij `sessions.addLocation`). Op de oude server crasht het Premium- en contactenscherm (onbekende functie). Alleen het meesturen van de batterij heeft een terugval (punt wordt zonder batterij opnieuw gestuurd).
2. De huidige app (v6) blijft werken op de nieuwe server: alle nieuwe velden zijn optioneel.

## 2. Convex deploy (productie)
- Nieuwe tabellen: `referrals`, `premiumGrants`. Nieuwe optionele velden: `sessions.batteryPct/batteryAt/lastSeenAt`, `alerts.batteryPct/batteryAt/lastSeenAt`.
- Gedrag dat verandert: **elke** geaccepteerde uitnodiging die een nieuw vertrouwd contact oplevert, geeft beide (16+) 30 dagen Premium (max. 3 per uitnodiger per 365 dagen, één keer per genodigde). Een gratis gebruiker heeft daarna dus een maand lang de Premium-limiet van 20 contacten.
- Een gewone tracking-link die aan een reis hangt, toont na het einde van de reis **geen** locatie meer (alleen de status).
- Optionele env-variabele: `SAFEWALK_DOWNLOAD_URL` (standaard `https://play.google.com/store/apps/details?id=nl.safewalk.app`).

## 3. Build v7 (~$1, EAS)
Nodig omdat er native onderdelen bij zijn gekomen: `expo-battery`, `expo-speech`, `expo-store-review` en een meldingsgeluid (`assets/sounds/fake_ringtone.wav`, via de expo-notifications-plugin). `versionCode` staat nog op 6 en moet bij de build naar 7.

## 4. Play Console + RevenueCat (niet gedaan; prijzen zijn een voorstel)
| Wat | Waar | Voorstel |
|---|---|---|
| Basisplan **jaar** aan het bestaande abonnement `safewalk_premium` | Play Console → Abonnementen → safewalk_premium → basisplan toevoegen, ID `yearly`, automatisch verlengen, 1 jaar | € 24,99 per jaar (≈30% goedkoper dan 12 × € 2,99). Kevin kiest de prijs |
| **Gratis proefweek** | Play Console → aanbieding op basisplan `yearly` (en eventueel `monthly`), type gratis proefperiode 7 dagen, alleen nieuwe klanten | 7 dagen |
| Product importeren | RevenueCat project SafeWalk → Products → `safewalk_premium:yearly` | koppelen aan entitlement `premium` |
| Pakket in aanbod | RevenueCat → Offerings → `default` → pakket `$rc_annual` met `safewalk_premium:yearly` | `$rc_monthly` blijft zoals het is |
| Maandprijs | ongewijzigd € 2,99 | — |

De app toont het jaarpakket en de proefweek **alleen** als RevenueCat ze echt teruggeeft (prijs en proefperiode komen uit de winkel). Zonder jaarpakket toont hij alleen het maandabonnement, zoals nu.

**Uitnodigingsbeloning:** geen Play- of RevenueCat-product nodig. De gratis maand is een Convex-gift (`premiumGrants`) die de server als Premium telt. Kosten: € 0. Er wordt geen RevenueCat promotional entitlement gebruikt; de gift zie je dus niet in RevenueCat.

## 5. Tekstwijzigingen
- **Privacybeleid** (in de repo bijgewerkt, `docs/privacybeleid.md` en `public-pages/privacy.html`): batterij en laatst-online, meekijklink, uitnodigingsbeloning, nep-oproep, beoordelingsvenster. De gehoste versie (GitHub Pages) is **niet** bijgewerkt; dat is publicatie en wacht op akkoord.
- **Gebruiksvoorwaarden** (niet gewijzigd). Voorstel voor artikel 5:
  > 5. **Premium.** € 2,99 per maand of € 24,99 per jaar, automatisch verlengd via App Store of Google Play; opzeggen via je store-account. Bij een gratis proefperiode betaal je pas na afloop, tenzij je vóór het einde opzegt. Wie iemand uitnodigt die voor het eerst zijn of haar vertrouwde contact wordt, krijgt samen met die persoon 30 dagen gratis Premium (vanaf 16 jaar, maximaal 3 keer per 365 dagen, geen recht op geld of verlenging; misbruik kan tot intrekking leiden). Essentiële veiligheidsfuncties (SOS, 2 contacten, tijdelijk delen, basis-check-ins, meekijklink, nep-oproep) blijven gratis.
- **Play Data safety**: controleren of het batterijpercentage onder een categorie valt (waarschijnlijk niet als aparte categorie; niet gecontroleerd).

## 6. Native beperkingen (eerlijk)
- Nep-oproep: geen volledig-schermoproep over het vergrendelscherm (Google beperkt `USE_FULL_SCREEN_INTENT` tot bel- en wekker-apps). App dicht of scherm uit → melding met beltoon; tikken opent het belscherm. De stem is de computerstem van het toestel (geen opgenomen stem); kwaliteit verschilt per toestel.
- "Ben je er?": alleen terwijl SafeWalk open is en je locatie deelt (geen achtergrondlocatie).
- Batterij: alleen bekend op momenten dat de app een locatiepunt stuurt (dus terwijl de app open is). Bij een gemiste check-in met dichte app toont de melding de laatst bekende waarde en het laatst-online-tijdstip.
- Beoordeling: Google/Apple bepalen zelf of het venster verschijnt (quota); SafeWalk ziet de uitkomst niet.
- Downloadlink op de meekijkpagina werkt voor iedereen pas na de productierelease; in de gesloten test alleen voor testers.
