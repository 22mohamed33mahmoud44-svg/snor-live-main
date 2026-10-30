/** A single studio instance may only create one accepted stream.
 * Failed attempts release the synchronous lock so the owner can retry.
 * This does NOT replace a database uniqueness constraint across devices.
 */
export type StreamLaunchResult = 'started' | 'failed' | 'busy';

export function createStreamLaunchGate<Args extends unknown[]>(
  launch: (...args: Args) => Promise<boolean>,
) {
  let pending = false;
  let started = false;

  return {
    isPending: () => pending,
    hasStarted: () => started,
    async start(...args: Args): Promise<StreamLaunchResult> {
      if (pending || started) return 'busy';
      pending = true;
      try {
        if (!(await launch(...args))) return 'failed';
        started = true;
        return 'started';
      } catch {
        return 'failed';
      } finally {
        pending = false;
      }
    },
  };
}
