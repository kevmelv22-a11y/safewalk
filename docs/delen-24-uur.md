# Locatie delen tot 24 uur en sms bij geen internet

Status: code + tests op branch `cursor/delen-24-uur`. **Niet samengevoegd, niet gedeployd, niet gebouwd, geen Play-wijziging.**

## Gekozen limiet
- Een deelperiode duurt **maximaal 24 uur** (serverlimiet). Keuze in de app: 1 uur, 4 uur, 8 uur, 24 uur, of “tot ik stop”.
- “Tot ik stop” krijgt dezelfde 24-uurslimiet. Ongeveer een uur van tevoren vraagt de app of je **nog 24 uur** wilt delen (verlengen vanaf het moment van verlengen, opnieuw max. 24 uur). Jij kunt altijd eerder stoppen.
- Geen check-in/escalatie bij dit type delen (in tegenstelling tot een reis of timer).

## Wat er is
- Bestaande meekijklink, achtergrondlocatie, offline-wachtrij en batterij/niet-live-signalen hergebruikt. Geen nieuw deelsysteem.
- Meekijkpagina toont duidelijk **laatst bekende locatie + tijd** en **verbinding kwijt** als updates stoppen. Na herstel komen bewaarde punten binnen (bestaande wachtrij).
- Op alle platformen: bij geen internet tijdens actief delen een **herinnering elke 15 minuten** (lokale melding + in de app) met één tik die een vooringevulde sms opent (`sms:`). Jij tikt zelf op versturen. Geen `SEND_SMS` nodig hiervoor.
- **Alleen Android, opt-in, standaard uit:** automatische sms-updates tijdens delen of SOS als er geen internet is. Interval **10 minuten**, max. **5 ontvangers**, max. **8 sms’jes per contact per sessie/SOS**. Stopt bij internet of einde delen. Runtime `SEND_SMS`. Niet voor onder de 16, behalve kindermodus.
- **iOS:** geen automatische sms (niet toegestaan). Alleen de vooringevulde sms.

## Native build en Play
- `SEND_SMS` is toegevoegd aan de bestaande module `safewalk-native` (geen nieuwe native dependency). Dat vraagt een **nieuwe native EAS-build**; de huidige v10-build heeft deze toestemming en de sms-functie niet.
- Google Play vereist een **speciale verklaring voor sms-rechten**. De kans op **afwijzing is reëel**: Play staat `SEND_SMS` alleen toe als kernfunctie van de app (berichten, back-up, enz.). Een veiligheidsapp die alleen bij geen internet een locatie-sms stuurt, wordt vaak geweigerd. Zonder goedkeuring werkt automatische sms niet in de Play-versie.
- Geen Play-formulieren in deze PR ingevuld. Geen build gestart.

## Niet getest op een toestel
- Achtergrondlocatie tijdens een 24-uursdeling (batterijbesparing kan de taak stoppen).
- Automatisch sms’en op echte Android (toestemming, SmsManager, kosten, gedrag zonder bereik). In tests en emulator wordt **nooit een echte sms** naar een nummer gestuurd (mock + test-wacht).
- Verlengprompt en stoppen na 24 uur op hardware.
- Convex-productie is niet gedeployd: schema-uitbreiding (`kind: 'share'`, `shareUntilStop`) moet eerst naar productie voordat een nieuwe app hiertegen praat.

## Privacy
In-app- en docs-teksten zijn bijgewerkt (16 november 2026). Een aparte, nog niet samengevoegde PR in `safewalk-legal` is bedoeld voor de openbare privacy.html.
