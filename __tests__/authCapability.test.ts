import {
  authCapabilityMessages,
  mapAuthEmailError,
} from '../src/components/AuthCapabilityNotice';

describe('mapAuthEmailError', () => {
  it('geeft gebruikersvriendelijke melding zonder serverlog/env-hints', () => {
    const msg = mapAuthEmailError('EMAIL_NOT_CONFIGURED');
    expect(msg).toMatch(/niet beschikbaar/i);
    expect(msg).not.toMatch(/Resend|AUTH_EMAIL|serverlog|DEV_LOG|server.?log/i);
    expect(mapAuthEmailError('EMAIL_SEND_FAILED')).toMatch(/niet beschikbaar/i);
    expect(mapAuthEmailError('OTHER')).toBeNull();
  });
});

describe('authCapabilityMessages', () => {
  it('geen output zonder server status', () => {
    expect(authCapabilityMessages(undefined)).toEqual([]);
    expect(authCapabilityMessages(null)).toEqual([]);
  });

  it('Google ontbreekt: geen e-mail-wachtwoord-push als mail ook kapot is', () => {
    const msgs = authCapabilityMessages({
      google: false,
      email: false,
      emailDelivery: false,
      emailDevLog: false,
    });
    expect(msgs.some((m) => /Google/i.test(m.text))).toBe(true);
    expect(msgs.some((m) => /niet beschikbaar/i.test(m.text) && /E-mail/i.test(m.text))).toBe(true);
    expect(msgs.join(' ')).not.toMatch(/Gebruik e-mail en wachtwoord/i);
    expect(msgs.map((m) => m.text).join('\n')).not.toMatch(/Resend|AUTH_EMAIL|serverlog|DEV_LOG/i);
  });

  it('emailDevLog = lokale/test: eerlijk geen inbox, geen serverlog-tip', () => {
    const msgs = authCapabilityMessages({
      google: true,
      email: true,
      emailDelivery: false,
      emailDevLog: true,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe('warn');
    expect(msgs[0].text).toMatch(/Lokale\/testomgeving|niet naar je e-mailbox/i);
    expect(msgs[0].text).not.toMatch(/Resend|AUTH_EMAIL|serverlog|DEV_LOG|console/i);
  });

  it('emailDelivery true: geen e-mailbanner', () => {
    const msgs = authCapabilityMessages({
      google: true,
      email: true,
      emailDelivery: true,
      emailDevLog: false,
    });
    expect(msgs).toEqual([]);
  });

  it('alleen Google uit, mail ok: alleen Google-melding', () => {
    const msgs = authCapabilityMessages({
      google: false,
      email: true,
      emailDelivery: true,
      emailDevLog: false,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toMatch(/Google/);
    expect(msgs[0].text).not.toMatch(/e-mail en wachtwoord/i);
  });
});
