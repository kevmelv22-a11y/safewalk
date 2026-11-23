/**
 * Country emergency numbers for the in-app helpline screen and the dial button.
 *
 * SafeWalk never places the call. The user confirms in the phone app.
 *
 * Sources (checked 21 November 2026):
 * - EU/EEA 112: European Commission, https://digital-strategy.ec.europa.eu/en/policies/112
 *   112 reaches emergency services in every EU country. It also works in the EEA
 *   (Iceland, Liechtenstein, Norway). National numbers can exist alongside 112.
 * - United Kingdom 999 and 112: https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers
 * - United States 911: https://www.fcc.gov/general/9-1-1-and-e9-1-1-services
 * - Canada 911: https://www.publicsafety.gc.ca/cnt/mrgnc-mngmnt/911/index-en.aspx
 * - Australia 000, and 112 from mobiles: https://www.infrastructure.gov.au/media-communications/phone/triple-zero/using-other-emergency-numbers
 * - New Zealand 111: https://www.govt.nz/browse/law-crime-and-justice/crimes-and-emergencies/111-emergency-service/
 * - Germany 112 (fire/rescue) and 110 (police): https://www.bundesregierung.de/breg-de/aktuelles/notruf-112-und-110-1791484
 * - Netherlands 112, police 0900-8844, Veilig Thuis 0800-2000: see helplines.ts (15 November 2026).
 * - 113 Zelfmoordpreventie 0800-0113: https://www.113.nl/
 * - Kindertelefoon 0800-0432: https://www.kindertelefoon.nl/
 * - Turkey 112: https://www.112.gov.tr/
 * - India 112: https://112.gov.in/
 * - Japan 110 police / 119 fire and ambulance: https://www.npa.go.jp/english/
 * - France 112, 15, 17, 18: https://www.service-public.fr/particuliers/vosdroits/F33954
 * - Norway 112 police, 113 ambulance, 110 fire: https://www.norge.no/en/service/contact-emergency-services
 * - Switzerland 112, 117, 144, 118: https://www.ch.ch/en/safety-and-justice/emergencies-and-dangers/
 * - Brazil 190 / 192 / 193: https://www.gov.br/pt-br
 * - Mexico 911: https://www.gob.mx/911
 *
 * Unknown regions do not pretend 112 is the local number. 112 is shown as a fallback
 * with an explicit warning. It is the EU number and works on many mobile networks,
 * but not on every phone and not in every country.
 */
import { isCountryCode } from './countries';

export type EmergencyRole =
  | 'unified'
  | 'police'
  | 'ambulance'
  | 'fire'
  | 'nonEmergencyPolice'
  | 'domesticViolence'
  | 'mentalHealth'
  | 'childLine';

export type EmergencyLine = {
  id: string;
  role: EmergencyRole;
  /** How to show the number, including dashes. */
  number: string;
  /** Digits only, for tel: */
  digits: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type EmergencyDirectory = {
  /** Uppercase ISO region, or null when the device region is unknown. */
  region: string | null;
  /** False when the region is not in the sourced table. */
  known: boolean;
  /** True when we show 112 only because the local number is unknown. */
  fallback: boolean;
  /** Number for the main "open dialer" button. */
  primary: EmergencyLine;
  lines: readonly EmergencyLine[];
  /** Optional i18n key with a country-specific note. */
  noteKey: string | null;
};

const EU_112: EmergencyLine = {
  id: '112',
  role: 'unified',
  number: '112',
  digits: '112',
  sourceLabel: 'European Commission: 112',
  sourceUrl: 'https://digital-strategy.ec.europa.eu/en/policies/112',
};

/** EU member states. 112 is the European emergency number in all of them. */
const EU = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;

/** EEA plus microstates and countries where 112 is an official emergency number. */
const CONFIRMED_112 = new Set<string>([
  ...EU,
  'IS', 'LI', 'NO',
  'CH', 'TR', 'UA', 'RS', 'BA', 'ME', 'MK', 'AL', 'MD', 'GE', 'AZ', 'KZ', 'AM',
  'MC', 'AD', 'SM', 'VA', 'XK', 'IN', 'ID', 'GH', 'NG',
]);

const NL_EXTRA: EmergencyLine[] = [
  {
    id: 'politie',
    role: 'nonEmergencyPolice',
    number: '0900-8844',
    digits: '09008844',
    sourceLabel: 'politie.nl: Wanneer bel ik 0900-8844?',
    sourceUrl: 'https://www.politie.nl/informatie/wanneer-bel-ik-0900-8844.html',
  },
  {
    id: 'veilig-thuis',
    role: 'domesticViolence',
    number: '0800-2000',
    digits: '08002000',
    sourceLabel: 'Rijksoverheid: Veilig Thuis',
    sourceUrl: 'https://www.rijksoverheid.nl/service/contact/contactgids/v/veilig-thuis',
  },
  {
    id: '113',
    role: 'mentalHealth',
    number: '0800-0113',
    digits: '08000113',
    sourceLabel: '113 Zelfmoordpreventie',
    sourceUrl: 'https://www.113.nl/',
  },
  {
    id: 'kindertelefoon',
    role: 'childLine',
    number: '0800-0432',
    digits: '08000432',
    sourceLabel: 'Kindertelefoon',
    sourceUrl: 'https://www.kindertelefoon.nl/',
  },
];

const NL_112: EmergencyLine = {
  id: '112',
  role: 'unified',
  number: '112',
  digits: '112',
  sourceLabel: 'Rijksoverheid: Wanneer kan ik alarmnummer 112 bellen?',
  sourceUrl: 'https://www.rijksoverheid.nl/onderwerpen/hulpdiensten-politie-brandweer-en-ambulance/vraag-en-antwoord/wanneer-kan-ik-alarmnummer-112-bellen',
};

function line(partial: EmergencyLine): EmergencyLine {
  return partial;
}

type Special = { primary: string; lines: EmergencyLine[]; noteKey?: string };

const SPECIAL: Record<string, Special> = {
  NL: { primary: '112', lines: [NL_112, ...NL_EXTRA] },
  DE: {
    primary: '112',
    noteKey: 'emergency.notes.de',
    lines: [
      EU_112,
      line({ id: '110', role: 'police', number: '110', digits: '110', sourceLabel: 'Bundesregierung: Notruf 112 und 110', sourceUrl: 'https://www.bundesregierung.de/breg-de/aktuelles/notruf-112-und-110-1791484' }),
    ],
  },
  FR: {
    primary: '112',
    noteKey: 'emergency.notes.fr',
    lines: [
      EU_112,
      line({ id: '15', role: 'ambulance', number: '15', digits: '15', sourceLabel: 'service-public.fr: Numéros d’urgence', sourceUrl: 'https://www.service-public.fr/particuliers/vosdroits/F33954' }),
      line({ id: '17', role: 'police', number: '17', digits: '17', sourceLabel: 'service-public.fr: Numéros d’urgence', sourceUrl: 'https://www.service-public.fr/particuliers/vosdroits/F33954' }),
      line({ id: '18', role: 'fire', number: '18', digits: '18', sourceLabel: 'service-public.fr: Numéros d’urgence', sourceUrl: 'https://www.service-public.fr/particuliers/vosdroits/F33954' }),
    ],
  },
  NO: {
    primary: '112',
    noteKey: 'emergency.notes.no',
    lines: [
      line({ id: '112', role: 'police', number: '112', digits: '112', sourceLabel: 'norge.no: Emergency services', sourceUrl: 'https://www.norge.no/en/service/contact-emergency-services' }),
      line({ id: '113', role: 'ambulance', number: '113', digits: '113', sourceLabel: 'norge.no: Emergency services', sourceUrl: 'https://www.norge.no/en/service/contact-emergency-services' }),
      line({ id: '110', role: 'fire', number: '110', digits: '110', sourceLabel: 'norge.no: Emergency services', sourceUrl: 'https://www.norge.no/en/service/contact-emergency-services' }),
    ],
  },
  CH: {
    primary: '112',
    noteKey: 'emergency.notes.ch',
    lines: [
      line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'ch.ch: Emergencies', sourceUrl: 'https://www.ch.ch/en/safety-and-justice/emergencies-and-dangers/' }),
      line({ id: '117', role: 'police', number: '117', digits: '117', sourceLabel: 'ch.ch: Emergencies', sourceUrl: 'https://www.ch.ch/en/safety-and-justice/emergencies-and-dangers/' }),
      line({ id: '144', role: 'ambulance', number: '144', digits: '144', sourceLabel: 'ch.ch: Emergencies', sourceUrl: 'https://www.ch.ch/en/safety-and-justice/emergencies-and-dangers/' }),
      line({ id: '118', role: 'fire', number: '118', digits: '118', sourceLabel: 'ch.ch: Emergencies', sourceUrl: 'https://www.ch.ch/en/safety-and-justice/emergencies-and-dangers/' }),
    ],
  },
  IE: {
    primary: '112',
    noteKey: 'emergency.notes.ie',
    lines: [
      EU_112,
      line({ id: '999', role: 'unified', number: '999', digits: '999', sourceLabel: 'European Commission: 112', sourceUrl: 'https://digital-strategy.ec.europa.eu/en/policies/112' }),
    ],
  },
  GB: {
    primary: '999',
    noteKey: 'emergency.notes.gb',
    lines: [
      line({ id: '999', role: 'unified', number: '999', digits: '999', sourceLabel: 'GOV.UK: 999 and 112', sourceUrl: 'https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers' }),
      line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'GOV.UK: 999 and 112', sourceUrl: 'https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers' }),
    ],
  },
  US: {
    primary: '911',
    lines: [line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'FCC: 9-1-1', sourceUrl: 'https://www.fcc.gov/general/9-1-1-and-e9-1-1-services' })],
  },
  CA: {
    primary: '911',
    lines: [line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'Public Safety Canada: 911', sourceUrl: 'https://www.publicsafety.gc.ca/cnt/mrgnc-mngmnt/911/index-en.aspx' })],
  },
  MX: {
    primary: '911',
    lines: [line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'Gobierno de México: 911', sourceUrl: 'https://www.gob.mx/911' })],
  },
  AU: {
    primary: '000',
    noteKey: 'emergency.notes.au',
    lines: [
      line({ id: '000', role: 'unified', number: '000', digits: '000', sourceLabel: 'Australia: Triple Zero (000)', sourceUrl: 'https://www.infrastructure.gov.au/media-communications/phone/triple-zero/using-other-emergency-numbers' }),
      line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'Australia: 112 from mobiles', sourceUrl: 'https://www.infrastructure.gov.au/media-communications/phone/triple-zero/using-other-emergency-numbers' }),
    ],
  },
  NZ: {
    primary: '111',
    lines: [line({ id: '111', role: 'unified', number: '111', digits: '111', sourceLabel: 'New Zealand Government: 111', sourceUrl: 'https://www.govt.nz/browse/law-crime-and-justice/crimes-and-emergencies/111-emergency-service/' })],
  },
  JP: {
    primary: '110',
    noteKey: 'emergency.notes.jp',
    lines: [
      line({ id: '110', role: 'police', number: '110', digits: '110', sourceLabel: 'National Police Agency of Japan', sourceUrl: 'https://www.npa.go.jp/english/' }),
      line({ id: '119', role: 'ambulance', number: '119', digits: '119', sourceLabel: 'Fire and Disaster Management Agency (119)', sourceUrl: 'https://www.fdma.go.jp/' }),
    ],
  },
  CN: {
    primary: '110',
    noteKey: 'emergency.notes.cn',
    lines: [
      line({ id: '110', role: 'police', number: '110', digits: '110', sourceLabel: 'Ministry of Public Security (110)', sourceUrl: 'https://www.mps.gov.cn/' }),
      line({ id: '120', role: 'ambulance', number: '120', digits: '120', sourceLabel: 'China emergency medical (120)', sourceUrl: 'https://www.nhc.gov.cn/' }),
      line({ id: '119', role: 'fire', number: '119', digits: '119', sourceLabel: 'China fire (119)', sourceUrl: 'https://www.119.gov.cn/' }),
    ],
  },
  KR: {
    primary: '112',
    noteKey: 'emergency.notes.kr',
    lines: [
      line({ id: '112', role: 'police', number: '112', digits: '112', sourceLabel: 'Korean National Police Agency: 112', sourceUrl: 'https://www.police.go.kr/' }),
      line({ id: '119', role: 'ambulance', number: '119', digits: '119', sourceLabel: 'Korea 119', sourceUrl: 'https://www.119.go.kr/' }),
    ],
  },
  BR: {
    primary: '190',
    noteKey: 'emergency.notes.br',
    lines: [
      line({ id: '190', role: 'police', number: '190', digits: '190', sourceLabel: 'Governo do Brasil: 190', sourceUrl: 'https://www.gov.br/pt-br' }),
      line({ id: '192', role: 'ambulance', number: '192', digits: '192', sourceLabel: 'SAMU 192', sourceUrl: 'https://www.gov.br/saude/pt-br' }),
      line({ id: '193', role: 'fire', number: '193', digits: '193', sourceLabel: 'Corpo de Bombeiros 193', sourceUrl: 'https://www.gov.br/pt-br' }),
    ],
  },
  ZA: {
    primary: '10111',
    noteKey: 'emergency.notes.za',
    lines: [
      line({ id: '10111', role: 'police', number: '10111', digits: '10111', sourceLabel: 'SAPS: 10111', sourceUrl: 'https://www.saps.gov.za/' }),
      line({ id: '10177', role: 'ambulance', number: '10177', digits: '10177', sourceLabel: 'South Africa ambulance 10177', sourceUrl: 'https://www.health.gov.za/' }),
      line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: '112 from mobiles (South Africa)', sourceUrl: 'https://digital-strategy.ec.europa.eu/en/policies/112' }),
    ],
  },
  IN: {
    primary: '112',
    lines: [line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'ERSS India: 112', sourceUrl: 'https://112.gov.in/' })],
  },
  TR: {
    primary: '112',
    lines: [line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'Türkiye 112', sourceUrl: 'https://www.112.gov.tr/' })],
  },
  SG: {
    primary: '999',
    noteKey: 'emergency.notes.sg',
    lines: [
      line({ id: '999', role: 'police', number: '999', digits: '999', sourceLabel: 'Singapore Police Force: 999', sourceUrl: 'https://www.police.gov.sg/' }),
      line({ id: '995', role: 'ambulance', number: '995', digits: '995', sourceLabel: 'SCDF: 995', sourceUrl: 'https://www.scdf.gov.sg/' }),
    ],
  },
  HK: {
    primary: '999',
    lines: [line({ id: '999', role: 'unified', number: '999', digits: '999', sourceLabel: 'Hong Kong Police: 999', sourceUrl: 'https://www.police.gov.hk/' })],
  },
  MY: {
    primary: '999',
    lines: [line({ id: '999', role: 'unified', number: '999', digits: '999', sourceLabel: 'Malaysia: 999', sourceUrl: 'https://www.malaysia.gov.my/' })],
  },
  TH: {
    primary: '191',
    noteKey: 'emergency.notes.th',
    lines: [
      line({ id: '191', role: 'police', number: '191', digits: '191', sourceLabel: 'Royal Thai Police: 191', sourceUrl: 'https://www.royalthaipolice.go.th/' }),
      line({ id: '1669', role: 'ambulance', number: '1669', digits: '1669', sourceLabel: 'Thailand medical 1669', sourceUrl: 'https://www.moph.go.th/' }),
      line({ id: '199', role: 'fire', number: '199', digits: '199', sourceLabel: 'Thailand fire 199', sourceUrl: 'https://www.disaster.go.th/' }),
    ],
  },
  PH: {
    primary: '911',
    lines: [line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'Philippines: 911', sourceUrl: 'https://www.gov.ph/' })],
  },
  AR: {
    primary: '911',
    lines: [line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'Argentina: 911', sourceUrl: 'https://www.argentina.gob.ar/' })],
  },
  CO: {
    primary: '123',
    lines: [line({ id: '123', role: 'unified', number: '123', digits: '123', sourceLabel: 'Colombia: 123', sourceUrl: 'https://www.gov.co/' })],
  },
  CL: {
    primary: '133',
    noteKey: 'emergency.notes.cl',
    lines: [
      line({ id: '133', role: 'police', number: '133', digits: '133', sourceLabel: 'Carabineros de Chile: 133', sourceUrl: 'https://www.carabineros.cl/' }),
      line({ id: '131', role: 'ambulance', number: '131', digits: '131', sourceLabel: 'SAMU Chile: 131', sourceUrl: 'https://www.minsal.cl/' }),
      line({ id: '132', role: 'fire', number: '132', digits: '132', sourceLabel: 'Bomberos de Chile: 132', sourceUrl: 'https://www.bomberos.cl/' }),
    ],
  },
  PE: {
    primary: '105',
    noteKey: 'emergency.notes.pe',
    lines: [
      line({ id: '105', role: 'police', number: '105', digits: '105', sourceLabel: 'Policía Nacional del Perú: 105', sourceUrl: 'https://www.gob.pe/' }),
      line({ id: '116', role: 'ambulance', number: '116', digits: '116', sourceLabel: 'SAMU Perú: 116', sourceUrl: 'https://www.gob.pe/' }),
    ],
  },
  EG: {
    primary: '122',
    noteKey: 'emergency.notes.eg',
    lines: [
      line({ id: '122', role: 'police', number: '122', digits: '122', sourceLabel: 'Egypt police 122', sourceUrl: 'https://www.moi.gov.eg/' }),
      line({ id: '123', role: 'ambulance', number: '123', digits: '123', sourceLabel: 'Egypt ambulance 123', sourceUrl: 'https://www.mohp.gov.eg/' }),
    ],
  },
  IL: {
    primary: '100',
    noteKey: 'emergency.notes.il',
    lines: [
      line({ id: '100', role: 'police', number: '100', digits: '100', sourceLabel: 'Israel Police: 100', sourceUrl: 'https://www.gov.il/en/departments/israel_police' }),
      line({ id: '101', role: 'ambulance', number: '101', digits: '101', sourceLabel: 'Magen David Adom: 101', sourceUrl: 'https://www.mdais.org/' }),
      line({ id: '102', role: 'fire', number: '102', digits: '102', sourceLabel: 'Israel Fire and Rescue: 102', sourceUrl: 'https://www.gov.il/' }),
    ],
  },
  AE: {
    primary: '999',
    noteKey: 'emergency.notes.ae',
    lines: [
      line({ id: '999', role: 'police', number: '999', digits: '999', sourceLabel: 'UAE police 999', sourceUrl: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/emergencies' }),
      line({ id: '998', role: 'ambulance', number: '998', digits: '998', sourceLabel: 'UAE ambulance 998', sourceUrl: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/emergencies' }),
      line({ id: '997', role: 'fire', number: '997', digits: '997', sourceLabel: 'UAE civil defence 997', sourceUrl: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/emergencies' }),
    ],
  },
  SA: {
    primary: '911',
    noteKey: 'emergency.notes.sa',
    lines: [
      line({ id: '911', role: 'unified', number: '911', digits: '911', sourceLabel: 'Saudi unified 911', sourceUrl: 'https://www.moi.gov.sa/' }),
      line({ id: '999', role: 'police', number: '999', digits: '999', sourceLabel: 'Saudi police 999', sourceUrl: 'https://www.moi.gov.sa/' }),
    ],
  },
  KE: {
    primary: '999',
    noteKey: 'emergency.notes.ke',
    lines: [
      line({ id: '999', role: 'unified', number: '999', digits: '999', sourceLabel: 'Kenya: 999', sourceUrl: 'https://www.nationalpolice.go.ke/' }),
      line({ id: '112', role: 'unified', number: '112', digits: '112', sourceLabel: 'Kenya: 112', sourceUrl: 'https://www.nationalpolice.go.ke/' }),
    ],
  },
};

/** US and UK numbering plans used by territories. */
const LIKE_US = ['PR', 'VI', 'GU', 'AS', 'MP'];
const LIKE_GB = ['GI', 'IM', 'JE', 'GG'];

function normalizeRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const code = region.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function directoryFrom(region: string | null, spec: Special, known: boolean, fallback: boolean): EmergencyDirectory {
  const primary = spec.lines.find((l) => l.id === spec.primary) ?? spec.lines[0];
  return {
    region,
    known,
    fallback,
    primary,
    lines: spec.lines,
    noteKey: spec.noteKey ?? null,
  };
}

/**
 * Emergency numbers for a region.
 * Pass null when the device region is unknown.
 * An unrecognised but well-formed code still falls back to 112 with fallback=true.
 */
export function emergencyDirectory(region: string | null | undefined): EmergencyDirectory {
  const code = normalizeRegion(region);
  if (!code) {
    return directoryFrom(null, { primary: '112', lines: [EU_112], noteKey: 'emergency.notes.unknown' }, false, true);
  }
  if (LIKE_US.includes(code)) return directoryFrom(code, SPECIAL.US, true, false);
  if (LIKE_GB.includes(code)) return directoryFrom(code, SPECIAL.GB, true, false);
  const special = SPECIAL[code];
  if (special) return directoryFrom(code, special, true, false);
  if (CONFIRMED_112.has(code)) return directoryFrom(code, { primary: '112', lines: [EU_112] }, true, false);
  return directoryFrom(code, { primary: '112', lines: [EU_112], noteKey: 'emergency.notes.unknown' }, false, true);
}

/** True when this region should show Dutch-only helplines (Veilig Thuis, 113, Kindertelefoon, 0900-8844). */
export function showsDutchHelplines(region: string | null | undefined): boolean {
  return normalizeRegion(region) === 'NL';
}

export function isKnownCountry(code: string | null | undefined): boolean {
  return !!code && isCountryCode(code);
}

/** Every sourced emergency digit-string, so a fake call cannot display them. */
export function blockedEmergencyDigits(): Set<string> {
  const out = new Set<string>(['112', '911', '999', '000']);
  for (const spec of Object.values(SPECIAL)) {
    for (const l of spec.lines) out.add(l.digits);
  }
  return out;
}
