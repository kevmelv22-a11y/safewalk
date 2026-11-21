/**
 * Eerlijke teksten voor "locatie nu sturen" en de volume-omhoog-snelkoppeling.
 *
 * Wat er echt gebeurt (convex/incidents.sendLiveLocationNow): één pushmelding met je huidige
 * locatie (kaartlink) naar je geaccepteerde vertrouwde contacten in de app. Geen sms/WhatsApp,
 * geen doorlopend delen. Volume-omhoog 2× werkt alleen op Android terwijl SafeWalk open op het
 * scherm staat (niet op de achtergrond, niet met scherm uit, niet op iOS).
 */
export const QUICK_LOCATION = {
  title: 'Stuur mijn locatie nu',
  hint: 'Eén pushmelding met je huidige locatie naar je vertrouwde contacten in de app. Geen sms, geen doorlopend delen.',
  screenIntro: 'Je vertrouwde contacten in de app krijgen één pushmelding met je huidige locatie (kaartlink). Dit is een momentopname: wil je dat ze je blijven volgen, start dan een reis. SafeWalk stuurt geen sms of WhatsApp en belt 112 niet.',
  volumeAndroid: 'Android: 2× snel volume-omhoog doet hetzelfde, maar alleen terwijl SafeWalk open op je scherm staat. Op de achtergrond, met het scherm uit of op iPhone werkt het niet. Max. 1× per minuut.',
  volumeToggleOn: 'Volume-omhoog 2× stuurt direct: AAN (tik om uit te zetten)',
  volumeToggleOff: 'Volume-omhoog 2× direct laten sturen: UIT (tik om aan te zetten)',
  volumeToggleHint: 'Uit: volume-omhoog 2× opent dit scherm en jij bevestigt. Aan: je locatie gaat meteen weg.',
  shortcuts: 'De Android-snelinstellingentegel en de iPhone-snelkoppeling (lang drukken op het app-icoon) openen dit scherm. Ze sturen nooit vanzelf: jij tikt zelf op de knop.',
} as const;

export function volumeSentNote(sent: string | undefined | null): { kind: 'ok' | 'warn'; text: string } | null {
  if (sent == null) return null;
  if (sent === 'cooldown') return { kind: 'warn', text: 'Volume-omhoog 2×: net al verstuurd. Opnieuw kan na 1 minuut.' };
  if (sent === 'no_consent') return { kind: 'warn', text: 'Volume-omhoog 2×: geen locatietoestemming, niets verstuurd.' };
  if (sent === 'failed') return { kind: 'warn', text: 'Volume-omhoog 2×: versturen mislukt (geen internet?). Probeer de knop.' };
  if (/^\d+$/.test(sent)) {
    const n = Number(sent);
    return n > 0
      ? { kind: 'ok', text: `Volume-omhoog 2×: je locatie is als pushmelding naar ${n} ${n === 1 ? 'contact' : 'contacten'} gestuurd.` }
      : { kind: 'warn', text: 'Volume-omhoog 2×: je hebt nog geen vertrouwde contacten, dus niemand heeft iets gekregen.' };
  }
  return null;
}
