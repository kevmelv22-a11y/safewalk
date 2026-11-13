/** Teksten voor "vrienden uitnodigen" (16+). Eén bron, zodat Premium-scherm, contacten en uitnodiging hetzelfde zeggen. */
export const REFERRAL_COPY = {
  title: 'Nodig een vriend(in) uit: jullie krijgen allebei 1 maand Premium',
  explain: 'Zodra iemand jouw uitnodiging accepteert en voor het eerst jouw vertrouwde contact wordt, krijgen jullie allebei 30 dagen gratis Premium. Geen betaalgegevens nodig en het stopt vanzelf. Alleen vanaf 16 jaar, maximaal 3 keer per jaar.',
};

/** Downloadlink voor wie SafeWalk nog niet heeft (Google Play-vermelding). */
export const DOWNLOAD_URL = 'https://play.google.com/store/apps/details?id=nl.safewalk.app';

export function inviteMessage(link: string, withReward: boolean): string {
  return [
    'Wil je mijn vertrouwde contact zijn in SafeWalk? Dan kun je meekijken als ik onderweg ben en krijg je een melding als er iets is.',
    `Open deze link (7 dagen geldig): ${link}`,
    `Nog geen SafeWalk? Download de app: ${DOWNLOAD_URL}`,
    withReward ? 'Als je accepteert, krijgen we allebei 1 maand Premium cadeau.' : '',
  ].filter(Boolean).join('\n');
}

export function referralResultCopy(outcome: string | null | undefined): string | null {
  if (outcome === 'rewarded') return 'Jullie hebben allebei 1 maand gratis Premium gekregen. 🎁';
  return null;
}
