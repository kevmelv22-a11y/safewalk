// Zet docs/privacybeleid.md en docs/gebruiksvoorwaarden.md om naar src/content/legal.ts (in-app schermen).
// Draai na elke wijziging in docs: node scripts/sync-legal.mjs (een Jest-test bewaakt dat ze gelijk lopen).
import { readFileSync, writeFileSync } from 'fs';
const r = (f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8');
const out = `// GEGENEREERD door scripts/sync-legal.mjs uit docs/ – niet handmatig bewerken.\nexport const PRIVACY_MD = ${JSON.stringify(r('privacybeleid.md'))};\nexport const TERMS_MD = ${JSON.stringify(r('gebruiksvoorwaarden.md'))};\n`;
writeFileSync(new URL('../src/content/legal.ts', import.meta.url), out);
