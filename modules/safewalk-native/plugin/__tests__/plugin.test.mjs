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
