import { ENTRY } from '../src/lib/nativeEntryPoints';

describe('native entry points', () => {
  it('exposes stable deep link and paths', () => {
    expect(ENTRY.quickPing).toBe('/quick-ping');
    expect(ENTRY.deepQuickPing).toBe('safewalk://quick-ping');
  });
});
