import { classifyConnection, CONNECTION_COPY } from '../src/lib/connectionStatus';
import { feedFall, newFallState, FALL_COOLDOWN_MS, FALL_IMPACT_G, FALL_STILL_MS } from '../src/lib/fallDetect';
import { fenceTransition, isInsideFence } from '../src/lib/geofence';
import { PersistentQueue, backoffMs } from '../src/lib/queue';
import { parseOverpass } from '../src/lib/safePlaces';

function mem(): { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> } {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v); } };
}

describe('verbindingsstatus', () => {
  it('classificeert verbonden, alleen sms en geen bereik eerlijk', () => {
    expect(classifyConnection({ isConnected: true, isInternetReachable: true, type: 'wifi' })).toBe('online');
    expect(classifyConnection({ isConnected: true, isInternetReachable: false, type: 'cellular' })).toBe('sms_only');
    expect(classifyConnection({ isConnected: true, isInternetReachable: false, type: 'wifi' })).toBe('offline');
    expect(classifyConnection({ isConnected: false, isInternetReachable: false, type: 'none' })).toBe('offline');
    expect(CONNECTION_COPY.offline.body).toMatch(/Zonder enig netwerkbereik/);
    expect(CONNECTION_COPY.sms_only.body).toMatch(/Live meekijken via de link werkt niet/);
    expect(CONNECTION_COPY.sms_only.body).toMatch(/automatische sms-updates/);
    expect(CONNECTION_COPY.sms_only.body).toMatch(/iPhone kan een app nooit zelf sms/);
  });
});

describe('valdetectie', () => {
  it('trigert pas na een piek gevolgd door stilte, niet bij alleen lopen', () => {
    const st = newFallState();
    expect(feedFall(st, 0.2, 1.0, 0.1, 0)).toBe(false);
    expect(feedFall(st, 0.3, 1.1, 0.2, 100)).toBe(false);
    expect(feedFall(st, FALL_IMPACT_G, 0, 0, 200)).toBe(false);
    expect(feedFall(st, 0, 1, 0, 400)).toBe(false);
    expect(feedFall(st, 0, 1, 0, 400 + FALL_STILL_MS)).toBe(true);
    expect(feedFall(st, FALL_IMPACT_G, 0, 0, 400 + FALL_STILL_MS + 10)).toBe(false); // cooldown
    const later = newFallState();
    later.lastTrigger = -FALL_COOLDOWN_MS;
    expect(feedFall(later, 0.2, 0.9, 0.1, 0)).toBe(false);
  });
});

describe('geofence', () => {
  const home = { lat: 52.37, lng: 4.89, radiusM: 150 };
  it('herkent binnen/buiten en alleen echte overgangen', () => {
    expect(isInsideFence({ lat: 52.3701, lng: 4.8901 }, home)).toBe(true);
    expect(isInsideFence({ lat: 52.4, lng: 5.0 }, home)).toBe(false);
    expect(fenceTransition(undefined, true)).toBe(null);
    expect(fenceTransition(true, true)).toBe(null);
    expect(fenceTransition(true, false)).toBe('leave');
    expect(fenceTransition(false, true)).toBe('enter');
  });
});

describe('offline-wachtrij batch', () => {
  it('dedupeert op id, batched due, en past backoff toe bij falen', async () => {
    const q = new PersistentQueue<{ n: number }>(mem(), 'q', 5);
    await q.push('a', { n: 1 });
    await q.push('a', { n: 99 });
    await q.push('b', { n: 2 });
    expect((await q.all()).map((i) => i.id)).toEqual(['a', 'b']);
    const due = await q.due(0);
    expect(due).toHaveLength(2);
    await q.applyResults(['a'], [{ id: 'b', error: 'net' }], 0);
    const left = await q.all();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe('b');
    expect(left[0].attempts).toBe(1);
    expect(left[0].nextAt).toBe(backoffMs(1));
  });
});

describe('offline plekken-parser', () => {
  it('parseert Overpass-elementen', () => {
    const places = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 52.37, lon: 4.89, tags: { amenity: 'police', name: 'Bureau' } },
        { type: 'node', id: 2, lat: 52.371, lon: 4.891, tags: { amenity: 'hospital', name: 'ZH' } },
      ],
    }, { lat: 52.37, lng: 4.89 });
    expect(places[0].kind).toBe('police');
    expect(places[1].kind).toBe('hospital');
  });
});
