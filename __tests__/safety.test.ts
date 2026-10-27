import { locationFreshness, checkInPhase, formatCountdown, validateSessionInput, parseInviteToken, accuracyLabel, mapErrorNl, haversineMeters, timeAgo } from '../src/lib/safety';
import { PersistentQueue, backoffMs } from '../src/lib/queue';

const now = Date.parse('2026-10-27T20:00:00Z');
describe('locationFreshness', () => {
  it('none zonder update', () => expect(locationFreshness(null, now)).toBe('none'));
  it('fresh < 2 min', () => expect(locationFreshness(new Date(now - 60_000), now)).toBe('fresh'));
  it('stale > 2 min', () => expect(locationFreshness(new Date(now - 3 * 60_000), now)).toBe('stale'));
  it('lost > 10 min', () => expect(locationFreshness(new Date(now - 11 * 60_000), now)).toBe('lost'));
});
describe('checkInPhase', () => {
  const due = new Date(now);
  it('running', () => expect(checkInPhase(due, 5, now - 5 * 60_000)).toBe('running'));
  it('due', () => expect(checkInPhase(due, 5, now - 30_000)).toBe('due'));
  it('grace', () => expect(checkInPhase(due, 5, now + 60_000)).toBe('grace'));
  it('overdue', () => expect(checkInPhase(due, 5, now + 6 * 60_000)).toBe('overdue'));
});
test('formatCountdown', () => { expect(formatCountdown(65_000)).toBe('1:05'); expect(formatCountdown(-5_000)).toBe('-0:05'); expect(formatCountdown(3_661_000)).toBe('1:01:01'); });
describe('validateSessionInput', () => {
  const ok = { destination: 'Thuis', arrival: new Date(now + 20 * 60_000), viewerIds: ['a'] };
  it('geldig', () => expect(validateSessionInput(ok, now)).toBeNull());
  it('lege bestemming', () => expect(validateSessionInput({ ...ok, destination: ' ' }, now)).toMatch(/bestemming/));
  it('verleden', () => expect(validateSessionInput({ ...ok, arrival: new Date(now - 1) }, now)).toMatch(/toekomst/));
  it('te lang', () => expect(validateSessionInput({ ...ok, arrival: new Date(now + 13 * 3600_000) }, now)).toMatch(/12 uur/));
  it('geen contact', () => expect(validateSessionInput({ ...ok, viewerIds: [] }, now)).toMatch(/contact/));
});
test('parseInviteToken', () => {
  const t = 'a'.repeat(64);
  expect(parseInviteToken(`safewalk://invite/${t}`)).toBe(t);
  expect(parseInviteToken(`https://safewalk.app/invite?token=${t}`)).toBe(t);
  expect(parseInviteToken('onzin')).toBeNull();
});
test('labels', () => {
  expect(accuracyLabel(10)).toMatch(/goed/); expect(accuracyLabel(500)).toMatch(/onnauwkeurig/); expect(accuracyLabel(null)).toMatch(/onbekend/);
  expect(mapErrorNl('CONTACT_LIMIT: x')).toMatch(/maximaal 2/);
  expect(timeAgo(new Date(now - 125_000), now)).toBe('2 min geleden');
});
test('haversine ~ Amsterdam-Utrecht', () => {
  const d = haversineMeters({ lat: 52.3676, lng: 4.9041 }, { lat: 52.0907, lng: 5.1214 });
  expect(d).toBeGreaterThan(33_000); expect(d).toBeLessThan(36_000);
});

describe('PersistentQueue (offline SOS)', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); } }; };
  it('dedupliceert en verstuurt', async () => {
    const q = new PersistentQueue<{ a: number }>(mem(), 'q');
    await q.push('1', { a: 1 }); await q.push('1', { a: 1 });
    const sent: string[] = [];
    expect(await q.flush(async (_p, id) => { sent.push(id); }, 0)).toBe(1);
    expect(sent).toEqual(['1']); expect(await q.all()).toHaveLength(0);
  });
  it('houdt item vast bij fout met backoff en probeert later opnieuw', async () => {
    const q = new PersistentQueue<number>(mem(), 'q');
    await q.push('x', 1);
    await q.flush(async () => { throw new Error('offline'); }, 1000);
    const [it] = await q.all();
    expect(it.attempts).toBe(1); expect(it.nextAt).toBe(1000 + backoffMs(1));
    expect(await q.flush(async () => {}, 1001)).toBe(0); // nog niet aan de beurt
    expect(await q.flush(async () => {}, it.nextAt)).toBe(1);
  });
});
