/**
 * An update that changed no rows does not prove a call ended. Verify the
 * server's ended status in case the other participant ended it concurrently.
 * A denied write, missing match, unavailable server, or thrown network error
 * must never be treated as a successful hangup.
 */
export type MatchEndUpdate = { data: { id: string } | null; error?: unknown };
export type MatchEndStatus = { data: { status: string } | null; error?: unknown };

export async function confirmMatchEnded(
  updateActiveMatch: () => Promise<MatchEndUpdate>,
  getMatchStatus: () => Promise<MatchEndStatus>,
): Promise<boolean> {
  try {
    const updated = await updateActiveMatch();
    if (!updated || updated.error) return false;
    if (updated.data?.id) return true;

    const checked = await getMatchStatus();
    return Boolean(checked && !checked.error && checked.data?.status === 'ended');
  } catch (error) {
    console.error('Unable to confirm call ended on server:', error);
    return false;
  }
}
