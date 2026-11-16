// Nederlandse teksten voor langdurig locatie delen en sms-reserve. Geen "gegarandeerd veilig".

export const SHARE_COPY = {
  title: 'Locatie delen',
  intro: 'Deel je locatie met je vertrouwde contacten voor een gekozen tijd, of tot jij stopt. Zij zien je live locatie zolang er internet is. Dit is een hulpmiddel; SafeWalk is geen hulpdienst en belt niet 112.',
  untilStopHint: '“Tot ik stop” duurt per keer maximaal 24 uur. Ongeveer een uur van tevoren vraagt SafeWalk of je nog 24 uur wilt delen. Jij kunt altijd eerder stoppen.',
  limitHint: 'Een deelperiode duurt nooit langer dan 24 uur. Daarna stopt het delen automatisch, tenzij jij bij “tot ik stop” verlengt.',
  start: 'Start delen',
  stop: 'Stop delen',
  renewTitle: 'Delen stopt bijna',
  renewBody: 'Dit delen stopt over minder dan een uur (limiet van 24 uur). Wil je nog 24 uur delen, of nu stoppen?',
  renew: 'Nog 24 uur delen',
  activeUntil: 'Je deelt je locatie tot',
  activeUntilStop: 'Je deelt je locatie tot jij stopt, uiterlijk tot',
  lostTitle: 'Verbinding kwijt',
  lostBody: 'Er komt geen nieuwe locatie meer binnen. Dit is de laatst bekende locatie en tijd. Zodra er weer internet is, komen bewaarde punten binnen.',
  lastKnown: 'Laatst bekende locatie',
  noViewers: 'Kies minstens één vertrouwd contact, of zet de meekijklink aan.',
  ageBlocked: 'Delen kan pas vanaf 16 jaar. Van 13 tot en met 15 jaar kan dit alleen via kindermodus, nadat een ouder of voogd je heeft gekoppeld.',
} as const;

export const OFFLINE_SMS_COPY = {
  title: 'Geen internet tijdens delen',
  body: 'Live meekijken werkt nu niet. Je kunt een sms openen met je laatst bekende locatie. Jij tikt zelf op versturen; SafeWalk verstuurt geen sms voor je.',
  action: 'Open sms met locatie',
  notifyTitle: 'Geen internet: locatie delen',
  notifyBody: 'Open SafeWalk om een sms met je laatst bekende locatie te versturen. Jij tikt zelf op versturen.',
} as const;

export const AUTO_SMS_COPY = {
  title: 'Automatische sms bij geen internet (alleen Android)',
  hint: 'Uit standaard. Als je dit aanzet en er is geen internet tijdens locatie delen of een SOS, stuurt de app zelf elke 10 minuten een korte sms met je coördinaten en een kaartlink naar de telefooncontacten die jij kiest (maximaal 5 contacten, maximaal 8 sms’jes per contact per keer). Dit stopt zodra er weer internet is of jij het delen beëindigt. Een sms kan geld kosten, afhankelijk van je abonnement. SafeWalk heeft hiervoor de sms-toestemming nodig. Op iPhone kan een app nooit zelf sms’en; daar blijft de knop om zelf een sms te openen.',
  playRisk: 'Google Play keurt de sms-toestemming alleen goed na een speciale verklaring. Die aanvraag kan worden afgewezen; zonder goedkeuring werkt deze functie in de Play Store-versie niet.',
  cost: 'Let op: sms’jes kunnen geld kosten, vooral in het buitenland of zonder bundel.',
  permission: 'Toestemming om sms te versturen',
  permissionAsk: 'SafeWalk wil alleen een sms sturen als jij dit hebt aangezet en er geen internet is tijdens delen of SOS, zodat je gekozen contacten je locatie krijgen. SafeWalk leest of beheert je andere berichten niet.',
  permissionDenied: 'Zonder sms-toestemming kan SafeWalk geen sms zelf versturen. Je kunt nog wel zelf een vooringevulde sms openen.',
  recipients: 'Naar welke telefooncontacten?',
  noRecipients: 'Kies eerst telefooncontacten met een nummer. App-contacten zonder telefoonnummer kunnen geen sms ontvangen.',
  notAndroid: 'Op dit toestel kan SafeWalk geen sms zelf versturen. Je kunt wel zelf een vooringevulde sms openen.',
  ageBlocked: 'Automatische sms is vanaf 16 jaar. Van 13 tot en met 15 jaar kan dit alleen in kindermodus, nadat een ouder of voogd je heeft gekoppeld.',
  statusSent: 'Er is een sms met je locatie verstuurd naar je gekozen contacten.',
  statusCap: 'Het maximum aantal automatische sms’jes voor dit delen is bereikt.',
} as const;
