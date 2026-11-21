/* eslint-disable @typescript-eslint/no-require-imports -- loads app.config / app.json via require in Jest */
import {
  MAP_USER_AGENT, OSM_ATTRIBUTION, OSM_STYLE_DARK, OSM_STYLE_LIGHT,
  buildOsmMapHtml, buildOsmMapState, buildOsmUpdateScript, deltaToZoom,
} from '../src/lib/osmMap';
import { mapsAvailable } from '../src/lib/mapsAvailability';
const { buildConfig } = require('../app.config');
const appJson = require('../app.json');

describe('deltaToZoom', () => {
  test('maps typical regions to a usable zoom and clamps extremes', () => {
    expect(deltaToZoom(0.02)).toBeGreaterThanOrEqual(13);
    expect(deltaToZoom(0.02)).toBeLessThanOrEqual(16);
    expect(deltaToZoom(0.000001)).toBe(18);
    expect(deltaToZoom(180)).toBe(2);
  });
});

describe('buildOsmMapState', () => {
  test('keeps trail, destination, accuracy and geofence/place overlays', () => {
    const s = buildOsmMapState({
      center: { lat: 52.37, lng: 4.9 },
      latitudeDelta: 0.02,
      dark: true,
      markers: [
        { id: 'me', lat: 52.37, lng: 4.9, title: 'Laatste locatie', color: '#15803D' },
        { id: 'dest', lat: 52.38, lng: 4.91, title: 'Thuis', color: '#7856FF' },
        { id: 'place-1', lat: 52.371, lng: 4.901, title: 'Politie', color: '#2563eb' },
      ],
      lines: [{ id: 'trail', points: [{ lat: 52.37, lng: 4.9 }, { lat: 52.372, lng: 4.902 }], color: '#7856FF', width: 4 }],
      circles: [
        { id: 'acc', lat: 52.37, lng: 4.9, radiusM: 25, fillColor: 'rgba(120,86,255,0.2)', strokeColor: '#7856FF' },
        { id: 'home', lat: 52.36, lng: 4.89, radiusM: 150, fillColor: 'rgba(21,128,61,0.2)', strokeColor: '#15803D' },
        { id: 'empty', lat: 52.36, lng: 4.89, radiusM: 0, fillColor: '#000', strokeColor: '#000' },
      ],
    });
    expect(s.dark).toBe(true);
    expect(s.markers.map((m) => m.id)).toEqual(['me', 'dest', 'place-1']);
    expect(s.lines).toHaveLength(1);
    expect(s.circles.map((c) => c.id)).toEqual(['acc', 'home']);
  });
});

describe('buildOsmMapHtml', () => {
  const html = buildOsmMapHtml(buildOsmMapState({ center: { lat: 52.37, lng: 4.9 }, dark: false }));
  test('uses a pinned CSP MapLibre build, OpenFreeMap styles and OSM attribution', () => {
    expect(html).toContain('maplibre-gl-csp.js');
    expect(html).toContain('maplibre-gl-csp-worker.js');
    expect(html).toContain(OSM_STYLE_LIGHT);
    expect(html).toContain(OSM_STYLE_DARK);
    expect(html).toContain(OSM_ATTRIBUTION);
    expect(html).toContain('https://www.openstreetmap.org/copyright');
    expect(html).not.toContain('tile.openstreetmap.org');
    expect(html).not.toMatch(/GOOGLE_MAPS|maps.googleapis|maps.google.com\/maps\/api/);
  });
  test('escapes a hostile label so it cannot break out of the boot script', () => {
    const hostile = buildOsmMapHtml(buildOsmMapState({
      center: { lat: 52.37, lng: 4.9 },
      markers: [{ id: 'x', lat: 52.37, lng: 4.9, title: '</script><script>alert(1)</script>' }],
    }));
    expect(hostile).toContain('\\u003c/script>');
    expect(hostile).not.toContain('</script><script>alert(1)');
    const scripts = hostile.split('<script').length - 1;
    expect(scripts).toBe(2); // maplibre src + inline boot
  });
  test('update script ends with true and carries new coordinates', () => {
    const js = buildOsmUpdateScript(buildOsmMapState({ center: { lat: 51.92, lng: 4.48 } }));
    expect(js.endsWith('true;')).toBe(true);
    expect(js).toContain('51.92');
    expect(js).toContain('4.48');
  });
});

describe('maps no longer need a Google key', () => {
  test('mapsAvailable is true on Android without mapsConfigured', () => {
    expect(mapsAvailable('android', { mapsConfigured: { android: false } })).toBe(true);
    expect(mapsAvailable('android', {})).toBe(true);
    expect(mapsAvailable('ios', {})).toBe(true);
    expect(mapsAvailable('web', {})).toBe(true);
  });
  test('buildConfig never writes a Google Maps key, even if the env is set', () => {
    const base = appJson.expo;
    expect(JSON.stringify(appJson)).not.toContain('${GOOGLE_MAPS');
    const without = buildConfig(base, {});
    expect(without.android.config?.googleMaps).toBeUndefined();
    expect(without.extra.mapsConfigured).toBeUndefined();
    const withKey = buildConfig(base, { GOOGLE_MAPS_ANDROID_API_KEY: 'k' });
    expect(withKey.android.config?.googleMaps).toBeUndefined();
    expect(mapsAvailable('android', withKey.extra)).toBe(true);
  });
  test('user agent identifies the app and a contact address', () => {
    expect(MAP_USER_AGENT).toMatch(/SafeWalk\/0\.1\.0/);
    expect(MAP_USER_AGENT).toMatch(/nl\.safewalk\.app/);
    expect(MAP_USER_AGENT).toMatch(/support@vonkbyte\.nl/);
  });
});
