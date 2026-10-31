/**
 * An asynchronous hangup may finish after CallUI is unmounted or its parent
 * switches matches. Only the still-mounted call may navigate; at most once.
 * Each room/match gets its own guard and disposes it during effect cleanup.
 */
export function createCallNavigationGuard() {
  let disposed = false;
  let navigated = false;

  return {
    isActive: () => !disposed && !navigated,
    claim: () => {
      if (disposed || navigated) return false;
      navigated = true;
      return true;
    },
    dispose: () => {
      disposed = true;
    },
  };
}
