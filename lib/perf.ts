/**
 * Timing for the slow paths, printed to the Metro log in development only.
 *
 * Checkout is a chain of sequential round trips to Frankfurt, and on a phone
 * each one costs far more than it does from a desktop on wifi. When it feels
 * slow the question is always *which* step, and guessing at that from a
 * stopwatch reading of the whole submit has already cost time once: the
 * obvious suspect (network latency) turned out to be a 15-second poll waiting
 * for a value that could not change.
 *
 * `timed` wraps one await and logs what it cost. `phase` measures a whole
 * sequence and prints the total. Both are pass-through in production.
 */
const enabled = __DEV__;

// PromiseLike, not Promise: supabase-js query builders are thenable but are
// not Promise instances, and wrapping one is the main reason this exists.
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!enabled) return fn();
  const started = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label}: ${Date.now() - started}ms`);
  }
}

export function phase(label: string) {
  if (!enabled) return { done: () => {} };
  const started = Date.now();
  return {
    done: () => console.log(`[perf] ${label} TOTAL: ${Date.now() - started}ms`),
  };
}
