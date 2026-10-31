/** A client broadcast is untrusted. Never let malformed counts corrupt UI state. */
const MAX_LIKES_PER_BROADCAST = 5_000;

function validCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A delayed initial/reconnect snapshot can lag behind newer Realtime events
 * and local taps. Do not replace a newer visible value with stale DB data.
 *
 * Like broadcasts are not authoritative; a refreshed server count can move
 * the UI forwards, but never backwards within the same mounted stream.
 */
export function reconcileStreamLikeSnapshot(current: number, snapshot: unknown): number {
  if (!validCounter(snapshot)) return current;
  return Math.max(current, snapshot);
}

/** Accept only a bounded, positive integer from a Realtime like batch. */
export function safeStreamLikeBatchCount(raw: unknown): number {
  if (!validCounter(raw) || raw === 0 || raw > MAX_LIKES_PER_BROADCAST) return 0;
  return raw;
}

/** Avoid accidental string concatenation, negative increments, or overflow. */
export function addStreamLikeBatch(current: number, raw: unknown): number {
  const increment = safeStreamLikeBatchCount(raw);
  if (!increment || !validCounter(current)) return current;
  return Math.min(Number.MAX_SAFE_INTEGER, current + increment);
}
