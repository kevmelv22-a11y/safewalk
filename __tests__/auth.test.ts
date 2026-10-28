import { normalizeCode, isValidEmail, mapErrorNl } from '../src/lib/safety';

describe('normalizeCode', () => {
  it('accepteert 6 cijfers', () => expect(normalizeCode('123456')).toBe('123456'));
  it('verwijdert spaties en streepjes', () => expect(normalizeCode(' 123-456 ')).toBe('123456'));
  it('weigert te kort/letters', () => { expect(normalizeCode('12345')).toBeNull(); expect(normalizeCode('12a456')).toBeNull(); });
});
describe('isValidEmail', () => {
  it('geldig', () => expect(isValidEmail(' a@b.nl ')).toBe(true));
  it('ongeldig', () => { expect(isValidEmail('a@b')).toBe(false); expect(isValidEmail('')).toBe(false); });
});
describe('mapErrorNl auth', () => {
  it('e-mail niet ingesteld', () => expect(mapErrorNl('EMAIL_NOT_CONFIGURED')).toMatch(/niet ingesteld/));
  it('versturen mislukt', () => expect(mapErrorNl('EMAIL_SEND_FAILED')).toMatch(/niet worden verstuurd/));
  it('ongeldige code', () => expect(mapErrorNl('Invalid code')).toBe('De code is onjuist of verlopen.'));
});
