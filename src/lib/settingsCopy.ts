// Gewone Nederlandse uitleg voor technische resultaten (geen interne codes in beeld).

export function pushResultNl(reason: string, detail?: string): string {
  switch (reason) {
    case 'web': return 'In de browser zijn geen pushmeldingen mogelijk. Gebruik de app op je telefoon.';
    case 'simulator': return 'Dit is geen echte telefoon (emulator). Pushmeldingen werken alleen op een echt toestel.';
    case 'permission_denied': return 'Meldingen staan uit voor SafeWalk. Zet ze aan in de instellingen van je telefoon en probeer opnieuw.';
    case 'no_project_id': return 'Meldingen zijn in deze testversie nog niet goed ingesteld. Meld dit aan support@vonkbyte.nl.';
    case 'token_failed': return 'Je telefoon gaf geen meldingsadres terug. Controleer je internet en probeer opnieuw.';
    case 'register_failed': return 'Opslaan op de server lukte niet' + (detail && /AGE_/.test(detail) ? ' (leeftijdsgrens: meldingen pas vanaf 16 jaar).' : '. Controleer je internet en probeer opnieuw.');
    default: return 'Meldingen aanzetten lukte niet.';
  }
}

export function tileResultNl(r: string): string {
  switch (r) {
    case 'added': return 'Tegel toegevoegd. Veeg omlaag vanaf de bovenkant van je scherm om hem te gebruiken.';
    case 'already_added': return 'De tegel staat al in je snelinstellingen.';
    case 'declined': return 'Tegel niet toegevoegd. Je kunt hem later zelf toevoegen via het potloodje in je snelinstellingen.';
    case 'unsupported': return 'Je Android-versie kan de tegel niet vanuit de app toevoegen. Voeg hem zelf toe via het potloodje in je snelinstellingen.';
    default: return 'Tegel toevoegen lukte nu niet. Voeg hem zelf toe via het potloodje in je snelinstellingen.';
  }
}
