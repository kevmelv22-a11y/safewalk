import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Vraag om een beoordeling in de winkel na de 3e bevestigde veilige aankomst (alleen schone reizen, zonder gemiste
 * check-in), en maar één keer. Google/Apple bepalen zelf of het venster echt verschijnt.
 */
export const REVIEW_AFTER_ARRIVALS = 3;
const COUNT_KEY = 'safewalk.safeArrivals';
const PROMPTED_KEY = 'safewalk.reviewPromptedAt';

export function shouldPromptReview(count: number, promptedAt: number | null): boolean {
  return promptedAt === null && count >= REVIEW_AFTER_ARRIVALS;
}

type Store = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type Review = { isAvailableAsync: () => Promise<boolean>; hasAction: () => Promise<boolean>; requestReview: () => Promise<void> };

export async function recordSafeArrival(opts: { clean: boolean; store?: Store; review?: Review | null; now?: number }): Promise<'counted' | 'prompted' | 'skipped'> {
  const store = opts.store ?? AsyncStorage;
  if (!opts.clean) return 'skipped';
  const count = Number((await store.getItem(COUNT_KEY)) ?? '0') + 1;
  await store.setItem(COUNT_KEY, String(count));
  const prompted = await store.getItem(PROMPTED_KEY);
  if (!shouldPromptReview(count, prompted ? Number(prompted) : null)) return 'counted';
  const review = opts.review === undefined ? await import('expo-store-review').catch(() => null) : opts.review;
  if (!review) return 'counted';
  try {
    if (!(await review.isAvailableAsync()) || !(await review.hasAction())) return 'counted';
    await store.setItem(PROMPTED_KEY, String(opts.now ?? Date.now()));
    await review.requestReview();
    return 'prompted';
  } catch { return 'counted'; }
}
