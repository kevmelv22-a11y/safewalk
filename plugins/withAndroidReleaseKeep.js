const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withDangerousMod } = require('@expo/config-plugins');
const { appendReleaseKeepRules } = require('./androidReleaseKeep');

/**
 * Appends R8 keep rules to android/app/proguard-rules.pro during prebuild.
 * android/ is generated (CNG); do not edit it by hand.
 */
function withAndroidReleaseKeep(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.writeFileSync(file, appendReleaseKeepRules(existing));
      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(withAndroidReleaseKeep, 'safewalk-android-release-keep', '1.0.0');
