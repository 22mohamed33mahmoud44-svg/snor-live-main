// Keep random-match cancellation from terminating unrelated direct calls.
// Supabase RLS remains the authoritative participant authorization layer.
export type MatchToCancel = {
  id?: string | null;
  kind?: string | null;
  status?: string | null;
};

/**
 * A missing match means cancellation completed without a new active match.
 * Unexpected kinds / states fail closed instead of ending a different call.
 */
export async function finishCanceledRandomMatch(
  match: MatchToCancel | null | undefined,
  endMatch: (id: string) => Promise<boolean>,
): Promise<boolean> {
  if (!match) return true;
  if (!match.id || match.kind !== 'random' || match.status !== 'active') return false;
  return endMatch(match.id);
}


/**
 * A pending atomic_match_or_wait call may enqueue the user AFTER a component
 * unmount. Cancel the queue only once that request has settled, then look for
 * a random match formed in the meantime and end that specific match.
 *
 * The same ordering applies to the Cancel button and unmount cleanup.
 * A rejected start request still needs a queue cleanup attempt.
 */
export async function cancelRandomSearchAfterPending(
  pendingStart: Promise<unknown> | null,
  cancelWaiting: () => Promise<void>,
  findActiveRandomMatch: () => Promise<MatchToCancel | null>,
  endMatch: (id: string) => Promise<boolean>,
): Promise<boolean> {
  if (pendingStart) {
    await pendingStart.catch(() => {});
  }
  await cancelWaiting();
  const match = await findActiveRandomMatch();
  return await finishCanceledRandomMatch(match, endMatch);
}
