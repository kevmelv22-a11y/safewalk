import { createAlarmServiceController } from '../src/lib/alarmService';

function setup(native: { start: jest.Mock; stop: jest.Mock } | null = { start: jest.fn(() => true), stop: jest.fn(() => true) }) {
  const ctl = createAlarmServiceController(() => native);
  return { ctl, native };
}

describe('alarm-voorgronddienst (refcount)', () => {
  it('start bij eerste alarm en stopt bij laatste', () => {
    const { ctl, native } = setup();
    const a = ctl.acquire();
    const b = ctl.acquire();
    expect(native!.start).toHaveBeenCalledTimes(1);
    a();
    expect(native!.stop).not.toHaveBeenCalled();
    b();
    expect(native!.stop).toHaveBeenCalledTimes(1);
    expect(ctl.activeCount()).toBe(0);
  });

  it('release is idempotent (dubbele stop telt niet dubbel)', () => {
    const { ctl, native } = setup();
    const a = ctl.acquire();
    const b = ctl.acquire();
    a(); a();
    expect(native!.stop).not.toHaveBeenCalled();
    expect(ctl.activeCount()).toBe(1);
    b();
    expect(native!.stop).toHaveBeenCalledTimes(1);
  });

  it('herstart de dienst bij een nieuw alarm na stoppen', () => {
    const { ctl, native } = setup();
    ctl.acquire()();
    ctl.acquire();
    expect(native!.start).toHaveBeenCalledTimes(2);
  });

  it('zonder native module (iOS/web) geen fout', () => {
    const { ctl } = setup(null);
    expect(() => ctl.acquire()()).not.toThrow();
  });

  it('fout in native start/stop breekt het alarm niet', () => {
    const native = { start: jest.fn(() => { throw new Error('x'); }), stop: jest.fn(() => { throw new Error('y'); }) };
    const ctl = createAlarmServiceController(() => native);
    expect(() => ctl.acquire()()).not.toThrow();
  });
});
