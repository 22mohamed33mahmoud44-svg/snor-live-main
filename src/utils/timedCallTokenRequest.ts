/**
 * Treat a stalled LiveKit-token request as a recoverable timeout. A request
 * may resolve or reject after the user leaves or retries: never publish its
 * result into a newer call attempt.
 *
 * This does not cancel the network request; it cancels its UI callbacks and
 * timer. Every completed, failed and timed-out attempt settles at most once.
 */
export type CallTokenResult =
  | { status: 'ready'; token: string }
  | { status: 'failed' | 'timeout' };

type TokenResponse = {
  data?: { token?: unknown } | null;
  error?: unknown;
} | null | undefined;

export function beginTimedCallTokenRequest(
  fetchToken: () => Promise<TokenResponse>,
  timeoutMs: number,
  onSettled: (result: CallTokenResult) => void,
): () => void {
  let settled = false;
  const settle = (result: CallTokenResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    onSettled(result);
  };
  const timeoutId = setTimeout(() => settle({ status: 'timeout' }), timeoutMs);

  void Promise.resolve().then(fetchToken).then(
    response => {
      const token = response?.data?.token;
      if (response?.error || typeof token !== 'string' || !token) {
        settle({ status: 'failed' });
      } else {
        settle({ status: 'ready', token });
      }
    },
    error => {
      if (!settled) {
        console.error('Video call LiveKit token request failed:', error);
        settle({ status: 'failed' });
      }
    },
  );

  // Effect cleanup runs on unmount, match change and explicit retry.
  return () => {
    settled = true;
    clearTimeout(timeoutId);
  };
}
