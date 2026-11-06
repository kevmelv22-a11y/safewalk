import { COPY, EMERGENCY_NUMBER, TEL_112, onPressOpen112, open112Dialer } from '../src/lib/dial112';

describe('open112Dialer', () => {
  it('kent alleen nummer 112 / tel:112', () => {
    expect(EMERGENCY_NUMBER).toBe('112');
    expect(TEL_112).toBe('tel:112');
    expect(COPY.title).toMatch(/Open 112 in de telefoon-app/);
    expect(COPY.hint).toMatch(/Je bevestigt zelf/);
    expect(COPY.hint).toMatch(/niet automatisch/);
  });

  it('Android gebruikt ACTION_DIAL-callback (niet openURL/CALL)', async () => {
    const openURL = jest.fn(async () => { throw new Error('openURL mag niet op Android met native dial'); });
    const androidActionDial = jest.fn(async (uri: string) => {
      expect(uri).toBe('tel:112');
    });
    const r = await open112Dialer({ platform: 'android', openURL, androidActionDial });
    expect(r).toEqual({ ok: true, method: 'android_action_dial' });
    expect(androidActionDial).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('Android zonder native valt terug op tel: (geen automatische CALL)', async () => {
    const openURL = jest.fn(async (url: string) => {
      expect(url).toBe('tel:112');
    });
    const r = await open112Dialer({ platform: 'android', openURL, androidActionDial: undefined });
    expect(r).toEqual({ ok: true, method: 'tel_fallback' });
    expect(openURL).toHaveBeenCalledWith('tel:112');
  });

  it('iOS opent tel:112 via Linking-API (user/OS bevestigt)', async () => {
    const openURL = jest.fn(async () => undefined);
    const r = await open112Dialer({ platform: 'ios', openURL });
    expect(r).toEqual({ ok: true, method: 'ios_tel' });
    expect(openURL).toHaveBeenCalledWith('tel:112');
  });

  it('web zonder tel-support: geen nep-succes, toont nummer-uitleg', async () => {
    const openURL = jest.fn(async () => undefined);
    const canOpenURL = jest.fn(async () => false);
    const r = await open112Dialer({ platform: 'web', openURL, canOpenURL });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unsupported');
      expect(r.message).toMatch(/112/);
      expect(r.message).toMatch(/nooit automatisch/);
    }
    expect(openURL).not.toHaveBeenCalled();
  });

  it('start niet vanzelf: alleen na expliciete onPress-helper', async () => {
    const openURL = jest.fn(async () => undefined);
    // importeren/aanmaken mag niets openen
    expect(openURL).not.toHaveBeenCalled();
    const alert = jest.fn();
    await onPressOpen112({ platform: 'ios', openURL, alert });
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('onPress toont Alert bij unsupported web (geen openURL-succes)', async () => {
    const openURL = jest.fn(async () => undefined);
    const canOpenURL = jest.fn(async () => false);
    const alert = jest.fn();
    const r = await onPressOpen112({ platform: 'web', openURL, canOpenURL, alert });
    expect(r.ok).toBe(false);
    expect(alert).toHaveBeenCalledWith('112', expect.stringMatching(/112/));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('Android ACTION_DIAL-fout → failed message, geen stille ok', async () => {
    const androidActionDial = jest.fn(async () => { throw new Error('boom'); });
    const openURL = jest.fn();
    const r = await open112Dialer({ platform: 'android', openURL, androidActionDial });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/112/);
    expect(openURL).not.toHaveBeenCalled();
  });
});
