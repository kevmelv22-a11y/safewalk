# Release-notitie 13+ (bron, geen certificering)

Bijgewerkt vanuit de code op deze tak. Dit is geen juridisch advies en geen verklaring dat de app publicatieklaar is.

## Wat de code nu doet

- Onder 13: geboortejaar en -maand worden opgeslagen en de gevoelige functies weigeren met `AGE_UNDER_13`.
- 13 tot en met 15: dezelfde functies weigeren met `AGE_PARENT_REQUIRED`. Er is geen ouderverificatie. Een vinkje, e-mail of code zet dit niet open.
- Geen geboortejaar: `AGE_REQUIRED`. Ook bestaande accounts en inloggen via een provider.
- Vanaf 16, gerekend met jaar en maand: de bestaande functies blijven werken. Een latere opgave van een eerdere geboortedatum wordt geweigerd (`AGE_LOCKED`). De eerste opgave kan nog steeds onwaar zijn; dat is geen identiteitscontrole.
- Gevoelige serveracties die dicht blijven onder 16 of zonder leeftijd: reis starten, locatiepunten, incidenten, SOS, trackinglink, telefooncontacten uploaden, opname-upload, uitnodiging, pushtoken, PIN zetten of controleren, AI-assistent, bewegingsdetectie. De RevenueCat-SDK start in de app pas bij status `adult`.
- Account verwijderen wist nu ook incidentlocaties, deel-links (eerst ingetrokken, daarna verwijderd, token resolvet niet meer), billing-events van die gebruiker in Convex, foutlogs, auditregels van die gebruiker, opname-uploadintents en blokkades waarin die gebruiker geblokkeerd was.
- Incidentlocaties ouder dan de bestaande maximumtermijn van 3 dagen worden in de purge verwijderd. Fout- en auditregels ouder dan 12 maanden ook, gelijk aan de termijn die het privacybeleid al noemt. Play en RevenueCat bewaren hun eigen aankoopadministratie buiten deze database.

## Nog niet klaar voor publicatie

- Geen openbare privacy-URL en geen externe account-verwijderpagina.
- Geen ingebouwde ouderlijke machtiging. 13–15 kunnen de app openen maar niet de gevoelige functies gebruiken.
- Live sleutels, winkelproducten en toestelgedrag zijn niet in deze pas gecontroleerd.
- Er is nog geen Android-build gestart.
