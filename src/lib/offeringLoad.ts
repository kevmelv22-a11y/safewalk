/** Puur aanbod-resultaat. Geen prijzen verzinnen, geen entitlement toekennen. */

export const OFFERING_TIMEOUT_MS = 12_000;

export type OfferingShape<P> = {
  current: null | {
    monthly: P | null;
    availablePackages: readonly P[];
  };
};

export type OfferingLoad<P> =
  | { state: 'ready'; pkg: P }
  | { state: 'empty'; reason: 'no_current_offering' | 'no_packages' }
  | { state: 'error'; reason: 'timeout' | 'not_configured' | 'failed'; detail: string };

export function selectCurrentPackage<P>(offerings: OfferingShape<P>): P | null {
  const current = offerings.current;
  if (!current) return null;
  if (current.monthly) return current.monthly;
  return current.availablePackages[0] ?? null;
}

export function classifyOfferings<P>(offerings: OfferingShape<P>): OfferingLoad<P> {
  if (!offerings.current) return { state: 'empty', reason: 'no_current_offering' };
  const pkg = selectCurrentPackage(offerings);
  if (!pkg) return { state: 'empty', reason: 'no_packages' };
  return { state: 'ready', pkg };
}

export function sanitizeStoreError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return raw.replace(/\b(?:test|goog|appl)_[A-Za-z0-9]+\b/g, '…').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function classifyStoreError(error: unknown): OfferingLoad<never> {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg === 'OFFERING_TIMEOUT' || /timeout|timed out/i.test(msg)) {
    return { state: 'error', reason: 'timeout', detail: 'Het laden duurde te lang.' };
  }
  if (/configure|singleton|not been called|Uninitialized/i.test(msg)) {
    return { state: 'error', reason: 'not_configured', detail: 'De winkelmodule was nog niet gestart.' };
  }
  const detail = sanitizeStoreError(error);
  return { state: 'error', reason: 'failed', detail: detail || 'Onbekende fout' };
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OFFERING_TIMEOUT')), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
