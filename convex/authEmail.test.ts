/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { emailBody, generateCode, sendCode } from './authEmail';

const modules = import.meta.glob('./**/*.ts');

describe('OTP-codes', () => {
  test('altijd 6 cijfers en niet constant', async () => {
    const codes = await Promise.all(Array.from({ length: 50 }, generateCode));
    codes.forEach((c) => expect(c).toMatch(/^\d{6}$/));
    expect(new Set(codes).size).toBeGreaterThan(40);
  });
  test('mailtekst bevat code en NL-uitleg', () => {
    const b = emailBody('reset', '123456');
    expect(b.text).toContain('123456'); expect(b.text).toMatch(/nieuw wachtwoord/); expect(b.html).toContain('123456');
  });
});

describe('sendCode', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('zonder sleutel en zonder dev-log: duidelijke fout, geen nep-succes', async () => {
    await expect(sendCode('verify', 'a@b.nl', '111111', {})).rejects.toThrow(/EMAIL_NOT_CONFIGURED/);
  });
  test('zonder sleutel met AUTH_EMAIL_DEV_LOG: code wordt alleen server-side gelogd', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await sendCode('verify', 'a@b.nl', '222222', { AUTH_EMAIL_DEV_LOG: 'true' });
    expect(r).toEqual({ delivered: false, devLogged: true });
    expect(log.mock.calls.join(' ')).toContain('222222');
    log.mockRestore();
  });
  test('met sleutel: Resend API wordt aangeroepen', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', f);
    const r = await sendCode('reset', 'a@b.nl', '333333', { RESEND_API_KEY: 'k', AUTH_EMAIL_FROM: 'SafeWalk <x@y.nl>' });
    expect(r.delivered).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body); expect(body.to).toEqual(['a@b.nl']); expect(body.from).toBe('SafeWalk <x@y.nl>'); expect(body.text).toContain('333333');
  });
  test('Resend-fout wordt doorgegeven', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nee', { status: 422 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendCode('reset', 'a@b.nl', '1', { RESEND_API_KEY: 'k' })).rejects.toThrow(/EMAIL_SEND_FAILED/);
  });
});

describe('Convex Auth-flows (verify + reset)', () => {
  let sent: { to: string; text: string }[] = [];
  beforeEach(async () => {
    sent = [];
    process.env.SITE_URL = 'https://safewalk.test';
    if (!process.env.JWT_PRIVATE_KEY) {
      const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
      process.env.JWT_PRIVATE_KEY = (await exportPKCS8(privateKey)).trimEnd().replace(/\n/g, ' ');
      process.env.JWKS = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(publicKey)) }] });
    }
    process.env.RESEND_API_KEY = 'test-key';
    process.env.CONVEX_SITE_URL = 'https://test.convex.site';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { const b = JSON.parse(init.body); sent.push({ to: b.to[0], text: b.text }); return new Response('{}', { status: 200 }); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });
  const lastCode = () => /\n(\d{6})\n/.exec(sent.at(-1)!.text)![1];

  test('registratie stuurt verificatiecode en logt niet direct in', async () => {
    const t = convexTest(schema, modules);
    const r = await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signUp', email: 'nieuw@test.nl', password: 'heelgeheim123', name: 'Nieuw' } });
    expect(r.tokens ?? null).toBeNull();
    expect(sent).toHaveLength(1); expect(sent[0].to).toBe('nieuw@test.nl');
    const code = lastCode();
    await expect(t.action(api.auth.signIn, { provider: 'password', params: { flow: 'email-verification', email: 'nieuw@test.nl', code: code === '000000' ? '999999' : '000000' } })).rejects.toThrow();
    // inloggen zonder verificatie geeft geen tokens maar een nieuwe code
    const s2 = await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signIn', email: 'nieuw@test.nl', password: 'heelgeheim123' } });
    expect(s2.tokens ?? null).toBeNull(); expect(sent).toHaveLength(2);
    const ok = await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'email-verification', email: 'nieuw@test.nl', code: lastCode() } });
    expect(ok.tokens?.token).toBeTruthy();
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users[0].emailVerificationTime).toBeTypeOf('number');
    expect(await t.run((ctx) => ctx.db.query('profiles').collect())).toHaveLength(1);
  });

  test('wachtwoord herstellen met code; oud wachtwoord werkt daarna niet meer', async () => {
    const t = convexTest(schema, modules);
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signUp', email: 'r@test.nl', password: 'oudwachtwoord1', name: 'R' } });
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'email-verification', email: 'r@test.nl', code: lastCode() } });
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset', email: 'r@test.nl' } });
    expect(sent.at(-1)!.text).toMatch(/nieuw wachtwoord/);
    await expect(t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset-verification', email: 'r@test.nl', code: '12345x', newPassword: 'nieuwwachtwoord2' } })).rejects.toThrow();
    const ok = await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset-verification', email: 'r@test.nl', code: lastCode(), newPassword: 'nieuwwachtwoord2' } });
    expect(ok.tokens?.token).toBeTruthy();
    await expect(t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signIn', email: 'r@test.nl', password: 'oudwachtwoord1' } })).rejects.toThrow();
    const again = await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signIn', email: 'r@test.nl', password: 'nieuwwachtwoord2' } });
    expect(again.tokens?.token).toBeTruthy();
  });

  test('te kort nieuw wachtwoord wordt geweigerd', async () => {
    const t = convexTest(schema, modules);
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'signUp', email: 'k@test.nl', password: 'oudwachtwoord1', name: 'K' } });
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset', email: 'k@test.nl' } });
    await expect(t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset-verification', email: 'k@test.nl', code: lastCode(), newPassword: 'kort' } })).rejects.toThrow(/WEAK_PASSWORD/);
  });

  test('reset voor onbekend adres stuurt geen mail', async () => {
    const t = convexTest(schema, modules);
    await t.action(api.auth.signIn, { provider: 'password', params: { flow: 'reset', email: 'niemand@test.nl' } }).catch(() => {});
    expect(sent).toHaveLength(0);
  });
});
