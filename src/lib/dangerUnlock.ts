/**
 * PIN-unlock order for danger mode (safety-critical):
 * 1. Verify the PIN on the server FIRST. Nothing is stopped before that.
 * 2. Wrong PIN / offline / error → alarm AND recording keep running (a coerced wrong PIN must never end capture).
 * 3. Correct PIN → stop the recorder (fast, local), stop the alarm, then upload in the background so the
 *    upload never blocks or delays the unlock.
 */
export type UnlockOutcome = 'ok' | 'wrong' | 'offline' | 'rate_limited' | 'error';

export async function runDangerUnlock(deps: {
  verify: () => Promise<{ ok: boolean }>;
  stopRecorder: () => Promise<(() => Promise<void>) | null>; // returns the deferred upload, if any
  stopAlarm: () => Promise<void>;
  classifyError: (e: unknown) => Exclude<UnlockOutcome, 'ok' | 'wrong'>;
  onUploadError?: (e: unknown) => void;
}): Promise<UnlockOutcome> {
  let res: { ok: boolean };
  try { res = await deps.verify(); } catch (e) { return deps.classifyError(e); }
  if (!res.ok) return 'wrong';
  let upload: (() => Promise<void>) | null = null;
  try { upload = await deps.stopRecorder(); } catch (e) { deps.onUploadError?.(e); }
  try { await deps.stopAlarm(); } catch { /* alarm stop best effort; PIN already verified */ }
  if (upload) void upload().catch((e) => deps.onUploadError?.(e));
  return 'ok';
}
