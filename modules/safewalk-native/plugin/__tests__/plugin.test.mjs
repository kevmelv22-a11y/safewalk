import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

test('plugin module exports function', () => {
  const plugin = require('../withSafewalkNative.js');
  assert.equal(typeof plugin, 'function');
});

test('kotlin module source declares SafewalkNative and volume keys', () => {
  const kt = readFileSync(
    join(__dirname, '../../android/src/main/java/nl/safewalk/nativehelpers/SafewalkNativeModule.kt'),
    'utf8',
  );
  assert.match(kt, /KEYCODE_VOLUME_UP/);
  assert.match(kt, /onVolumeDoublePress/);
  assert.match(kt, /backgroundTorch" to false/);
});

test('swift module admits iOS volume unsupported', () => {
  const sw = readFileSync(join(__dirname, '../../ios/SafewalkNativeModule.swift'), 'utf8');
  assert.match(sw, /volumeDoublePress": false/);
  assert.match(sw, /SafewalkNative/);
});

test('extension / app ids remain parameterized (base package nl.safewalk.app)', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../../../../app.json'), 'utf8'));
  assert.equal(app.expo.ios.bundleIdentifier, 'nl.safewalk.app');
  assert.equal(app.expo.android.package, 'nl.safewalk.app');
  // Quick settings tile must not force app group that breaks adhoc wildcard unless configured
  const plugins = app.expo.plugins;
  const tile = plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-quick-settings-tile');
  assert.ok(tile, 'quick-settings-tile plugin configured');
  assert.equal(tile[1]?.ios?.appGroup, undefined);
});

test('alarm foreground service is declared with type mediaPlayback (idempotent)', () => {
  const plugin = require('../withSafewalkNative.js');
  const manifest = { manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' }, activity: [] }] } };
  plugin.addAlarmService(manifest);
  plugin.addAlarmService(manifest);
  const services = manifest.manifest.application[0].service;
  assert.equal(services.length, 1);
  assert.equal(services[0].$['android:name'], 'nl.safewalk.nativehelpers.AlarmForegroundService');
  assert.equal(services[0].$['android:foregroundServiceType'], 'mediaPlayback');
  assert.equal(services[0].$['android:exported'], 'false');
});

test('kotlin alarm service starts foreground as MEDIA_PLAYBACK with Dutch notification', () => {
  const kt = readFileSync(
    join(__dirname, '../../android/src/main/java/nl/safewalk/nativehelpers/AlarmForegroundService.kt'),
    'utf8',
  );
  assert.match(kt, /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
  assert.match(kt, /SafeWalk-alarm actief/);
  assert.match(kt, /getLaunchIntentForPackage/);
  assert.match(kt, /onTaskRemoved/);
  const mod = readFileSync(
    join(__dirname, '../../android/src/main/java/nl/safewalk/nativehelpers/SafewalkNativeModule.kt'),
    'utf8',
  );
  assert.match(mod, /startAlarmForegroundService/);
  assert.match(mod, /stopAlarmForegroundService/);
});

test('SEND_SMS is declared for Android auto-sms and kotlin exposes sendSms', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../../../../app.json'), 'utf8'));
  assert.ok(app.expo.android.permissions.includes('android.permission.SEND_SMS'));
  const pluginSrc = readFileSync(join(__dirname, '../withSafewalkNative.js'), 'utf8');
  assert.match(pluginSrc, /android\.permission\.SEND_SMS/);
  const kt = readFileSync(
    join(__dirname, '../../android/src/main/java/nl/safewalk/nativehelpers/SafewalkNativeModule.kt'),
    'utf8',
  );
  assert.match(kt, /sendTextMessage/);
  assert.match(kt, /SEND_SMS/);
  assert.match(kt, /"autoSms" to true/);
  // iOS mag niet zelf sms'en
  const sw = readFileSync(join(__dirname, '../../ios/SafewalkNativeModule.swift'), 'utf8');
  assert.match(sw, /reason": "unsupported"/);
  assert.match(sw, /"autoSms": false/);
});
