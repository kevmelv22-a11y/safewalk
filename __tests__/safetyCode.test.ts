import { isValidSafetyCode, safetyCodeIssue, SAFETY_CODE_MAX, SAFETY_CODE_MIN } from '../convex/safetyCode';
import { mapErrorNl } from '../src/lib/safety';

describe('veiligheidscode', () => {
  test('grenzen en tekenset, zonder trim of lowercase', () => {
    expect(SAFETY_CODE_MIN).toBe(4);
    expect(SAFETY_CODE_MAX).toBe(8);
    expect(isValidSafetyCode('1234')).toBe(true);
    expect(isValidSafetyCode('12345678')).toBe(true);
    expect(isValidSafetyCode('Ab12')).toBe(true);
    expect(safetyCodeIssue('abc')).toBe('short');
    expect(safetyCodeIssue('Abcdefghi')).toBe('long');
    expect(safetyCodeIssue('')).toBe('empty');
    expect(safetyCodeIssue('12 34')).toBe('charset');
    expect(safetyCodeIssue('1234 ')).toBe('charset');
    expect(safetyCodeIssue('ab-12')).toBe('charset');
    expect(isValidSafetyCode('ab12')).toBe(true);
    expect('Ab12'.toLowerCase()).not.toBe('Ab12');
  });

  test('fouttekst noemt letters en hoofdletters, niet alleen cijfers', () => {
    expect(mapErrorNl('PIN_INVALID')).toMatch(/letters/);
    expect(mapErrorNl('PIN_INVALID')).toMatch(/Hoofdletters/);
    expect(mapErrorNl('PIN_INVALID')).not.toMatch(/4–8 cijfers/);
    expect(mapErrorNl('PIN_NOT_SET')).toMatch(/veiligheidscode/);
  });
});
