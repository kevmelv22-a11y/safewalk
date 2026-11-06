/**
 * R8 full mode (AGP 8+, Expo SDK 58 release) keeps Room/WorkManager classes
 * but drops the no-arg constructors those libraries call via reflection.
 * androidx.startup.InitializationProvider then crashes the process before
 * the first frame:
 *   Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
 * Same rules as the Expo SDK 58 background-task fix (expo/expo#52414).
 */
const MARKER = '# safewalk-android-release-keep';

const RULES = [
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class * extends androidx.work.InputMerger { <init>(); }',
].join('\n');

function appendReleaseKeepRules(existing) {
  const text = typeof existing === 'string' ? existing : '';
  if (text.includes(MARKER)) return text.endsWith('\n') ? text : `${text}\n`;
  const block = `${MARKER}
# Keep reflective no-arg constructors WorkManager needs at process start.
${RULES}
`;
  const trimmed = text.replace(/\s*$/, '');
  return `${trimmed ? `${trimmed}\n` : ''}${block}`;
}

module.exports = { MARKER, RULES, appendReleaseKeepRules };
