/**
 * Hulplijnen Nederland. Nummers gecontroleerd op 15 november 2026 via officiële bronnen.
 * SafeWalk belt nooit automatisch: alleen de kiezer openen na een tik van de gebruiker.
 */
export type Helpline = {
  id: '112' | 'politie' | 'veilig-thuis';
  title: string;
  number: string;
  /** Alleen cijfers, voor tel: */
  digits: string;
  hint: string;
  when: string;
  cost: string;
  sourceLabel: string;
  sourceUrl: string;
};

export const HELPLINES: readonly Helpline[] = [
  {
    id: '112',
    title: 'Alarmnummer 112',
    number: '112',
    digits: '112',
    hint: 'Je bevestigt zelf; SafeWalk belt niet automatisch.',
    when: 'Bij spoed: levensgevaar, een misdrijf op heterdaad, of een acuut gevaarlijke situatie.',
    cost: 'Gratis.',
    sourceLabel: 'Rijksoverheid: Wanneer kan ik alarmnummer 112 bellen?',
    sourceUrl: 'https://www.rijksoverheid.nl/onderwerpen/hulpdiensten-politie-brandweer-en-ambulance/vraag-en-antwoord/wanneer-kan-ik-alarmnummer-112-bellen',
  },
  {
    id: 'politie',
    title: 'Politie (geen spoed)',
    number: '0900-8844',
    digits: '09008844',
    hint: 'Je bevestigt zelf; SafeWalk belt niet automatisch.',
    when: 'Voor politiezaken die niet spoedeisend zijn, 24 uur per dag. Bij spoed bel je 112.',
    cost: '2 cent per minuut, plus je gebruikelijke belkosten (bron: politie.nl).',
    sourceLabel: 'politie.nl: Wanneer bel ik 0900-8844?',
    sourceUrl: 'https://www.politie.nl/informatie/wanneer-bel-ik-0900-8844.html',
  },
  {
    id: 'veilig-thuis',
    title: 'Veilig Thuis',
    number: '0800-2000',
    digits: '08002000',
    hint: 'Je bevestigt zelf; SafeWalk belt niet automatisch.',
    when: 'Advies- en meldpunt voor huiselijk geweld en kindermishandeling. Gratis, 24 uur per dag. Je mag anoniem blijven. Bij direct gevaar bel je 112.',
    cost: 'Gratis.',
    sourceLabel: 'Rijksoverheid: Veilig Thuis',
    sourceUrl: 'https://www.rijksoverheid.nl/service/contact/contactgids/v/veilig-thuis',
  },
] as const;

export function telUri(digits: string): string {
  if (!/^\d{3,15}$/.test(digits)) throw new Error('BAD_TEL');
  return `tel:${digits}`;
}
