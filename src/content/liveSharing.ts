// Teksten voor live delen, meekijklink, privacy-check-in en schudden. Eén plek, zodat app, tests en Play-teksten gelijk blijven.
// Bewust geen "gegarandeerd veilig": SafeWalk helpt, maar is geen hulpdienst.

export const DISCLOSURE = {
  title: 'Locatie delen tijdens je reis',
  points: [
    'SafeWalk deelt je precieze locatie met de mensen die jij kiest: je vertrouwde contacten en/of wie jouw meekijklink heeft.',
    'Dit gebeurt ook als je scherm uit is of SafeWalk op de achtergrond staat, maar alleen vanaf het moment dat jij een reis of timer start tot je hem stopt, je aankomst bevestigt of hij verloopt.',
    'Op Android zie je zolang een vaste melding "SafeWalk deelt je locatie". Op iPhone zie je de blauwe locatie-indicator.',
    'SafeWalk vraagt geen toestemming voor "Altijd" locatie en deelt nooit buiten een reis of timer.',
    'Veeg SafeWalk tijdens je reis niet weg uit je recente apps: dan stopt het delen en zien je kijkers "niet meer live".',
    'Locatiepunten worden uiterlijk 24 uur na het einde van de reis verwijderd en nooit langer dan 3 dagen bewaard.',
  ],
  privacyPoint: 'Privacy-check-in staat aan: je locatie gaat wel naar de server (zodat die bij nood beschikbaar is), maar je kijkers zien alleen de status. Locatie, batterij en route worden pas zichtbaar bij een gemiste check-in of SOS.',
  accept: 'Ik begrijp het, start',
  cancel: 'Annuleren',
} as const;

export const LINK_KEY_WARNING = '🔑 Deze link werkt als een sleutel: iedereen die hem heeft, kan meekijken. Stuur hem alleen naar mensen die je vertrouwt. Je kunt hem altijd intrekken.';
export const CODE_HINT = 'Met een toegangscode van 6 cijfers kan iemand die de link per ongeluk krijgt, niet meekijken. Geef de code apart door, bijvoorbeeld telefonisch.';
export const PRIVACY_HINT = 'Kijkers zien alleen "onderweg", "aangekomen" of "check-in gemist". Je locatie, batterij en route worden pas zichtbaar bij een gemiste check-in of SOS.';
export const LINK_ONLY_HINT = 'Geen contacten met de app? Dan kun je ook alleen een meekijklink delen, bijvoorbeeld via WhatsApp.';
export const VIEWER_ALERTS_HINT = 'Wie de link opent, kan zelf meldingen aanzetten in de browser of per e-mail (met bevestiging en afmelden) bij SOS, een gemiste check-in, aankomst, een bijna lege batterij of als je niet meer live bent.';

export const SHAKE = {
  title: 'Schudden voor SOS',
  hint: 'Schud je telefoon een paar keer krachtig. Je krijgt dan eerst 5 seconden om te annuleren voordat SOS wordt verstuurd. Werkt alleen terwijl SafeWalk open is en je scherm aan staat.',
  detected: 'Schudden herkend',
} as const;

export const TIMER_LABELS = ['Date', 'Wandelen', 'Hardlopen', 'Taxi', 'Afspraak', 'Uitgaan'];
export const TIMER_MINUTES = [15, 30, 45, 60, 90, 120, 180];

export function modeLabel(mode: 'background' | 'foreground' | null): string {
  if (mode === 'background') return 'Je locatie wordt gedeeld, ook met scherm uit of SafeWalk op de achtergrond. Veeg SafeWalk niet weg.';
  if (mode === 'foreground') return 'Je locatie wordt alleen gedeeld zolang SafeWalk open is (delen op de achtergrond is op dit toestel niet beschikbaar).';
  return 'Je locatie wordt op dit moment niet gedeeld.';
}
