const {
  withMainActivity,
  createRunOncePlugin,
  AndroidConfig,
} = require('@expo/config-plugins');

const PKG = 'safewalk-native';

/**
 * Injecteert dispatchKeyEvent in MainActivity zodat foreground volume×2 werkt.
 * Bron is compleet; verificatie vereist native compile (prebuild/dev client) — label: uncompiled tot dan.
 */
function withVolumeKeyDispatch(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('SafewalkNativeModule.keyCallback')) {
      return cfg;
    }
    if (src.includes('class MainActivity')) {
      // Kotlin MainActivity (Expo default)
      if (!src.includes('import nl.safewalk.nativehelpers.SafewalkNativeModule')) {
        src = src.replace(
          /(package .*?\n)/,
          '$1\nimport nl.safewalk.nativehelpers.SafewalkNativeModule\nimport android.view.KeyEvent\n',
        );
      }
      if (!src.includes('override fun dispatchKeyEvent')) {
        src = src.replace(
          /class MainActivity[\s\S]*?\{/,
          (m) => `${m}
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val cb = SafewalkNativeModule.keyCallback
    if (cb != null && cb(event.keyCode, event.action)) return true
    return super.dispatchKeyEvent(event)
  }
`,
        );
      }
      cfg.modResults.contents = src;
    }
    return cfg;
  });
}

function withAndroidPermissions(config) {
  return AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.VIBRATE',
  ]);
}

const withSafewalkNative = (config) => {
  config = withAndroidPermissions(config);
  config = withVolumeKeyDispatch(config);
  return config;
};

module.exports = createRunOncePlugin(withSafewalkNative, PKG, '0.1.0');
