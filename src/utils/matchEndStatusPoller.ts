/**
 * Poll the authoritative match status without accumulating overlapping
 * Supabase requests while the network is slow or offline.
 *
 * A request that never resolves is abandoned after a bounded deadline:
 * the supplied AbortSignal cancels the PostgREST fetch and late responses
 * cannot navigate away from a newer call. Realtime end events still work.
 */
export const MATCH_END_STATUS_TIMEOUT_MS = 12_000;

type StatusResponse = {
  data?: { status: string } | null;
  error?: unknown;
} | null;

export function createMatchEndStatusPoller(
  readStatus: (signal: AbortSignal) => Promise<StatusResponse>,
  onEnded: () => void,
  timeoutMs = MATCH_END_STATUS_TIMEOUT_MS,
) {
  let disposed = false;
  let ended = false;
  let inFlight: Promise<void> | null = null;
  let activeController: AbortController | null = null;

  const check = (): Promise<void> => {
    if (disposed || ended) return Promise.resolve();
    if (inFlight) return inFlight;

    const controller = new AbortController();
    activeController = controller;
    let onAbort!: () => void;

    // Resolve the poll even if a network stack ignores AbortSignal and its
    // original Promise never settles. No old result can end the next call.
    const aborted = new Promise<null>(resolve => {
      onAbort = () => resolve(null);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const deadline = setTimeout(() => controller.abort(), timeoutMs);

    const request = Promise.resolve()
      .then(() => disposed || controller.signal.aborted ? null : readStatus(controller.signal));

    const task = Promise.race([request, aborted])
      .then(result => {
        if (disposed || ended || controller.signal.aborted || !result || result.error) return;
        if (result.data?.status === 'ended') {
          ended = true;
          onEnded();
        }
      })
      .catch(error => {
        // Errors from aborted/time-limited reads are expected, but real
        // network failures must not cause unhandled promise rejections.
        if (!disposed && !controller.signal.aborted) {
          console.warn('Unable to check call status:', error);
        }
      })
      .finally(() => {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', onAbort);
        if (activeController === controller) activeController = null;
        if (inFlight === task) inFlight = null;
      });

    inFlight = task;
    return task;
  };

  return {
    check,
    dispose() {
      disposed = true;
      activeController?.abort();
    },
  };
}
