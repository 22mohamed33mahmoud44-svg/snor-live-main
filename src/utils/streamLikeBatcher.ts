/**
 * Batch lightweight viewer likes without losing local counts when an RPC
 * rejects or returns an error. Only one database write may be in flight.
 *
 * The final flush on component teardown is best effort: browsers can abort
 * network activity when a tab closes, and PostgreSQL RPCs are not idempotent.
 */
export function createStreamLikeBatcher(
  persist: (count: number) => Promise<boolean>,
) {
  let pending = 0;
  let inFlight: Promise<boolean> | null = null;
  let closed = false;

  const flush = (): Promise<boolean> => {
    if (inFlight) return inFlight;
    if (pending === 0) return Promise.resolve(true);

    const count = pending;
    pending = 0;

    const task = Promise.resolve()
      .then(() => persist(count))
      .catch(error => {
        console.error('Unable to persist stream likes:', error);
        return false;
      })
      .then(success => {
        if (!success) pending += count;
        return success;
      })
      .finally(() => {
        if (inFlight === task) inFlight = null;
      });

    inFlight = task;
    return task;
  };

  return {
    add(count = 1) {
      if (closed || !Number.isSafeInteger(count) || count <= 0) return;
      pending = Math.min(Number.MAX_SAFE_INTEGER, pending + count);
    },
    pendingCount: () => pending,
    isFlushing: () => inFlight !== null,
    flush,
    async finish(): Promise<boolean> {
      closed = true;
      // Never flush another batch over an outstanding insert. If more likes
      // arrived during it, send them once the previous operation settles.
      const running = inFlight;
      if (running) await running;
      return flush();
    },
  };
}
