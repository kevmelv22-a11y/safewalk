# Offline testen van SafeWalk

**Laatst bijgewerkt:** 15 november 2026 (Europe/Amsterdam). Test op een echt toestel; de emulator liegt vaak over SMS en GPS.

SafeWalk verstuurt **geen** echte sms, e-mail of oproep in deze tests tenzij jij dat in de systeem-app zelf doet. Zet geen contacten in gevaar: gebruik een testaccount.

## Voorbereiding

1. Twee testaccounts (of ouder + kind van 13–15 voor kindermodus).
2. Locatietoestemming “tijdens gebruik” gegeven. Niet “Altijd” vragen.
3. Optioneel: een tweede telefoon met de meekijklink of als vertrouwd contact.
4. GPS-chip gebruiken (buiten of bij een raam). Alleen netwerklocatie is onvoldoende voor deze test.

## 1. Vliegtuigmodus (geen netwerk, geen sms)

1. Start een reis of kindermodus-delen terwijl je online bent, zodat de eerste punt aankomt.
2. Zet vliegtuigmodus **aan** (wifi en mobiel uit).
3. Verwacht in de app: “Geen bereik – locatie wordt bewaard en verstuurd zodra mogelijk”, plus de uitleg dat zonder enig bereik niets verstuurd kan worden.
4. Loop een paar minuten. De app moet blijven meten (voorgronddienst / blauwe indicator als die al liep).
5. Start een SOS. Verwacht: “queued”, niemand is gewaarschuwd, wel de sms-reserve-knop (die in vliegtuigmodus meestal niet kan verzenden).
6. Zet vliegtuigmodus uit. Verwacht: banner “Verbonden”, wachtrij spoelt, contact of ouder ziet de ingehaalde punten en eventuele SOS. Punten mogen niet dubbel verschijnen (zelfde `clientId`).

## 2. Alleen sms (mobiel netwerk, geen data)

1. Zet wifi uit en schakel mobiele data uit, maar laat bellen/sms aan (geen vliegtuigmodus). Of gebruik een sim zonder databundel.
2. Verwacht: “Alleen SMS” als het toestel het netwerk als mobiel zonder internet ziet. Sommige toestellen rapporteren dit als offline; dan is de eerlijke “geen bereik”-banner ook juist.
3. Open de vooringevulde sms. Controleer de tekst (locatie-link of coördinaten, “SafeWalk belt niet 112”, “Ik stuur dit bericht zelf”). **Verstuur alleen naar een testnummer.**
4. Bevestig dat de app zelf geen sms heeft gestuurd (geen `SEND_SMS`, geen stille berichten in je verzonden items zonder jouw tik).

## 3. Geen GPS-fix

1. Binnen in een kelder of met locatie uit.
2. De app mag geen verse “live”-claim tonen. Een SOS mag weg zonder coördinaten, met eerlijke tekst “geen recente locatie”.

## 4. Alarm-interval en stil alarm

1. Start “Ik voel me niet veilig” (met zaklamp-opt-in): geluid, optionele strobe, pings ongeveer elke 5 s als er een fix is (niet op de milliseconde meten; accu en OS mogen bundelen).
2. Start “Stil alarm”: geen geluid, geen licht, geen opname; contacten krijgen wél een melding (online). Stoppen met de veiligheidscode.

## 5. Kindermodus (korte check)

1. Ouder geeft toestemming en deelt de code. Kind koppelt.
2. Kindscherm toont “Je locatie wordt gedeeld met …”.
3. Ouder ziet locatie + tijd, of “verbinding verbroken” na het stoppen van delen of het sluiten van de app.
4. Zone thuis instellen op de locatie van de ouder; kind verlaat de zone terwijl delen loopt → melding aan de ouder (online).

## Wat deze tests niet bewijzen

- Aflevering van push bij de ontvanger (dat is Apple/Google).
- Gedrag onder alle accu-optimalisaties van fabrikanten.
- Play- of App Store-goedkeuring van kindermodus of locatie op de achtergrond.
