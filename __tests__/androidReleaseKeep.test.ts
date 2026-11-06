import { readFileSync } from 'fs';
import { appendReleaseKeepRules, MARKER, RULES } from '../plugins/androidReleaseKeep';

const app = JSON.parse(readFileSync('app.json', 'utf8')) as { expo: { plugins: unknown[] } };

describe('android release keep rules', () => {
  test('app config registers the prebuild plugin', () => {
    expect(app.expo.plugins).toContain('./plugins/withAndroidReleaseKeep.js');
  });

  test('rules keep the constructors WorkManager reflects on, and append is idempotent', () => {
    expect(RULES).toContain('-keep class * extends androidx.room.RoomDatabase { <init>(); }');
    expect(RULES).toContain('-keep class * extends androidx.work.InputMerger { <init>(); }');
    const once = appendReleaseKeepRules('# existing\n-keep class com.example.Foo { *; }\n');
    expect(once).toContain(MARKER);
    expect(once).toContain('# existing');
    expect(once).toContain('androidx.room.RoomDatabase');
    expect(once).toContain('androidx.work.InputMerger');
    expect(appendReleaseKeepRules(once)).toBe(once);
    expect(appendReleaseKeepRules('')).toBe(appendReleaseKeepRules(''));
    expect(appendReleaseKeepRules('')).toContain(MARKER);
  });
});
