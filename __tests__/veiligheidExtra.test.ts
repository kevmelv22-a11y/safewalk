import { validCoords, mapsQueryUrl } from '../src/lib/coords';
import { parseRideShare, rideShareLine, RIDE_PLATE_MAX } from '../src/lib/rideShare';
import { reserveSmsMessage } from '../src/lib/composer';
import { HELPLINES, telUri } from '../src/lib/helplines';
import { classifyTags, overpassQuery, parseOverpass, placeNavigateUrl } from '../src/lib/safePlaces';
import { normalizeEmergencyInfo } from '../src/lib/emergencyInfo';
import { openBatteryOptimizationSettings, BATTERY_HINT_ANDROID_NL } from '../src/lib/batteryOptimization';
import { mapsAvailable } from '../src/lib/mapsAvailability';
import { mapErrorNl } from '../src/lib/safety';

describe('coördinaten', () => {
  test('weigeren NaN, oneindig en buiten bereik', () => {
    expect(validCoords(52.37, 4.89)).toBe(true);
    expect(validCoords(Number.NaN, 4.89)).toBe(false);
    expect(validCoords(52, 181)).toBe(false);
    expect(mapsQueryUrl(52.1, 4.2)).toBe('https://maps.google.com/?q=52.100000,4.200000');
    expect(mapsQueryUrl(91, 0)).toBeNull();
  });
});

describe('rit delen', () => {
  test('normaliseert kenteken en slaat lege velden over', () => {
    const r = parseRideShare({ plate: ' xx-123-x ', driverName: '  Sam  ', vehicle: '' });
    expect(r).toEqual({ ok: true, value: { plate: 'XX-123-X', driverName: 'Sam' } });
    expect(rideShareLine(r.ok ? r.value : undefined)).toBe('Rit: kenteken XX-123-X · chauffeur Sam.');
  });
  test('leeg is ok, te lang of rare tekens niet', () => {
    expect(parseRideShare({})).toEqual({ ok: true });
    expect(parseRideShare({ plate: 'x'.repeat(RIDE_PLATE_MAX + 1) })).toEqual({ ok: false, issue: 'plate' });
    expect(parseRideShare({ plate: 'XX<123>' })).toEqual({ ok: false, issue: 'plate' });
  });
});

describe('sms als reserve', () => {
  test('zet een Maps-link in de tekst en belooft geen automatische sms', () => {
    const msg = reserveSmsMessage({ lat: 52.37, lng: 4.89, context: 'sos' });
    expect(msg).toMatch(/SOS via SafeWalk/);
    expect(msg).toContain('https://maps.google.com/?q=52.370000,4.890000');
    expect(msg).toMatch(/belt niet 112/);
    expect(msg).toMatch(/stuur dit bericht zelf/);
  });
  test('zonder locatie geen valse kaartlink', () => {
    expect(reserveSmsMessage({ context: 'trip', what: 'reis naar Huis' })).toMatch(/geen recente locatie/i);
    expect(reserveSmsMessage({ context: 'trip', what: 'reis naar Huis' })).not.toMatch(/maps\.google/);
  });
});

describe('hulplijnen', () => {
  test('officiële nummers 112, 0900-8844 en 0800-2000', () => {
    const byId = Object.fromEntries(HELPLINES.map((h) => [h.id, h]));
    expect(byId['112'].digits).toBe('112');
    expect(byId.politie.number).toBe('0900-8844');
    expect(byId.politie.digits).toBe('09008844');
    expect(byId['veilig-thuis'].number).toBe('0800-2000');
    expect(byId['veilig-thuis'].digits).toBe('08002000');
    expect(byId.politie.cost).toMatch(/2 cent/);
    expect(byId['112'].sourceUrl).toMatch(/rijksoverheid\.nl/);
    expect(byId.politie.sourceUrl).toMatch(/politie\.nl/);
    expect(byId['veilig-thuis'].sourceUrl).toMatch(/rijksoverheid\.nl/);
    expect(telUri('08002000')).toBe('tel:08002000');
    expect(() => telUri('12')).toThrow('BAD_TEL');
  });
});

describe('plekken in de buurt (Overpass)', () => {
  test('query is begrensd en bevat politie en ziekenhuis', () => {
    const q = overpassQuery(52.37, 4.89);
    expect(q).toMatch(/amenity"="police"/);
    expect(q).toMatch(/amenity"="hospital"/);
    expect(q).toMatch(/around:2500,52.370000,4.890000/);
    expect(() => overpassQuery(999, 0)).toThrow('BAD_COORDS');
  });
  test('parser sorteert, slaat ongeldige punten over en herkent 24/7', () => {
    const places = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 52.371, lon: 4.891, tags: { amenity: 'hospital', name: 'OLVG', opening_hours: '24/7' } },
        { type: 'node', id: 2, lat: 52.372, lon: 4.892, tags: { amenity: 'police', name: 'Bureau' } },
        { type: 'node', id: 3, lat: 999, lon: 0, tags: { amenity: 'pharmacy', name: 'Kapot' } },
        { type: 'way', id: 4, center: { lat: 52.373, lon: 4.893 }, tags: { shop: 'supermarket', name: 'AH' } },
      ],
    }, { lat: 52.37, lng: 4.89 });
    expect(places.map((p) => p.kind)).toEqual(['police', 'hospital', 'supermarket']);
    expect(places[1].maybeOpen24h).toBe(true);
    expect(classifyTags({ amenity: 'fuel' })).toBe('fuel');
    expect(placeNavigateUrl(52.37, 4.89, 'android')).toMatch(/google.com\/maps\/dir/);
    expect(placeNavigateUrl(52.37, 4.89, 'ios')).toMatch(/maps.apple.com/);
  });
});

describe('noodinfo', () => {
  test('knipt te lange velden en vult ontbrekende keys', () => {
    const n = normalizeEmergencyInfo({ medicalNotes: 'x'.repeat(600), iceName: 'Maya' });
    expect(n.medicalNotes).toHaveLength(500);
    expect(n.iceName).toBe('Maya');
    expect(n.allergies).toBe('');
  });
});

describe('accu-optimalisatie', () => {
  test('Android opent eerst de accu-instellingen, anders app-instellingen', async () => {
    const sendIntent = jest.fn(async () => undefined);
    const openSettings = jest.fn(async () => undefined);
    await expect(openBatteryOptimizationSettings({ platform: 'android', sendIntent, openSettings })).resolves.toBe(true);
    expect(sendIntent).toHaveBeenCalledWith('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    expect(openSettings).not.toHaveBeenCalled();
    expect(BATTERY_HINT_ANDROID_NL).toMatch(/accu-optimalisatie/);
    expect(BATTERY_HINT_ANDROID_NL).not.toMatch(/gegarandeerd veilig/);
  });
});

describe('kaartsleutel blijft optioneel', () => {
  test('Android zonder extra.mapsConfigured.android toont geen kaart', () => {
    expect(mapsAvailable('android', { mapsConfigured: { android: false } })).toBe(false);
    expect(mapsAvailable('android', { mapsConfigured: { android: true } })).toBe(true);
    expect(mapsAvailable('ios', { mapsConfigured: { android: false } })).toBe(true);
  });
});

describe('foutteksten dwangcode', () => {
  test('zelfde code als veiligheidscode krijgt een duidelijke NL-fout', () => {
    expect(mapErrorNl('PIN_SAME_AS_DURESS')).toMatch(/anders zijn/);
    expect(mapErrorNl('DURESS_SAME_AS_PIN')).toMatch(/anders zijn/);
  });
});
