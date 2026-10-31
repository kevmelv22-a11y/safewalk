import { readFileSync } from 'fs';
import { join } from 'path';
import { PRIVACY_MD, TERMS_MD } from '../src/content/legal';
import { parseMarkdown } from '../src/lib/markdown';

describe('juridische teksten', () => {
  it('in-app tekst is gelijk aan docs/ (draai scripts/sync-legal.mjs)', () => {
    expect(PRIVACY_MD).toBe(readFileSync(join(__dirname, '../docs/privacybeleid.md'), 'utf8'));
    expect(TERMS_MD).toBe(readFileSync(join(__dirname, '../docs/gebruiksvoorwaarden.md'), 'utf8'));
  });
  it('privacy noemt 112-disclaimer en dat beheerders geen locatie zien', () => {
    expect(PRIVACY_MD).toMatch(/belt nooit automatisch 112/);
    expect(PRIVACY_MD).toMatch(/Beheerders van SafeWalk kunnen je locatie niet inzien/);
  });
  it('parser herkent koppen, lijsten, tabellen en slaat scheidingsregels over', () => {
    const b = parseMarkdown('# T\n\n## Kop\n- a\n1. b\n| x | y |\n|---|---|\n| 1 | 2 |\n> let op\ntekst');
    expect(b.map((x) => x.type)).toEqual(['h1', 'h2', 'li', 'li', 'row', 'row', 'quote', 'p']);
    expect(b[3].text).toBe('1. b'); expect(b[5].cells).toEqual(['1', '2']);
  });
});
