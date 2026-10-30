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
