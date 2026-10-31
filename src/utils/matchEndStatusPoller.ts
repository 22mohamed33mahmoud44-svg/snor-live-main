/**
 * Poll the authoritative match status without accumulating overlapping
 * Supabase requests while the network is slow or offline.
 *
 * Realtime end events still work independently of this fallback poll.
 * The watcher ignores late responses after CallUI exits or switches matches.
 */
export function createMatchEndStatusPoller(
  readStatus: () => Promise<{
    data?: { status: string } | null;
    error?: unknown;
  } | null>,
  onEnded: () => void,
) {
  let disposed = false;
  let ended = false;
  let inFlight: Promise<void> | null = null;

  const check = (): Promise<void> => {
    if (disposed || ended) return Promise.resolve();
    if (inFlight) return inFlight;

    const task = Promise.resolve()
      .then(() => disposed ? null : readStatus())
      .then(result => {
        if (disposed || ended || !result || result.error) return;
        if (result.data?.status === 'ended') {
          ended = true;
          onEnded();
        }
      })
      .catch(error => {
        // Supabase usually returns { error }, but a rejected network request
        // must not produce an unhandled promise or falsely end the call.
        if (!disposed) console.warn('Unable to check call status:', error);
      })
      .finally(() => {
        if (inFlight === task) inFlight = null;
      });

    inFlight = task;
    return task;
  };

  return {
    check,
    dispose() {
      disposed = true;
    },
  };
}
