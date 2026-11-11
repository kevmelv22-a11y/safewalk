import fs from 'fs';
import path from 'path';
import { createAudioModeController } from '../src/lib/audioMode';

function setup() {
  const set = jest.fn(async (_mode: Record<string, unknown>) => {});
  const ctl = createAudioModeController(async () => set);
  return { ctl, set };
}

describe('gedeelde audiomodus (alarm + opname)', () => {
  it('alarm-modus zet achtergrondweergave en doNotMix', async () => {
    const { ctl, set } = setup();
    await ctl.apply({ playsInSilentMode: true });
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
    }));
  });

  it('opname starten tijdens alarm overschrijft shouldPlayInBackground NIET (regressie pauzerend alarm)', async () => {
    const { ctl, set } = setup();
    await ctl.apply({ playsInSilentMode: true }); // alarm
    await ctl.apply({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true }); // opname
    expect(set).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: true,
      allowsBackgroundRecording: true,
    });
  });

  it('alarm (her)starten tijdens opname zet achtergrond-opname niet terug op uit', async () => {
    const { ctl, set } = setup();
    await ctl.apply({ allowsRecording: true, allowsBackgroundRecording: true });
    await ctl.apply({ playsInSilentMode: true });
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: true, allowsBackgroundRecording: true, shouldPlayInBackground: true }));
  });

  it('alarm-vereisten zijn niet te overschrijven via een patch', async () => {
    const { ctl, set } = setup();
    await ctl.apply({ shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' } as never);
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' }));
  });

  it('geen enkel bestand in app/ of src/ roept expo-audio setAudioModeAsync direct aan', () => {
    const root = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith(path.join('lib', 'audioMode.ts'))) {
          if (/setAudioModeAsync\s*\(/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p));
        }
      }
    };
    walk(path.join(root, 'app'));
    walk(path.join(root, 'src'));
    expect(offenders).toEqual([]);
  });
});
