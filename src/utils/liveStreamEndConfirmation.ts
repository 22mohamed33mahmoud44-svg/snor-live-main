export type UpdateResult = { data: { id: string } | null; error?: unknown };
export type StatusResult = { data: { is_live: boolean } | null; error?: unknown };

/**
 * A zero-row UPDATE does not prove that the owner ended a live stream.
 * Another request may have ended it already, but it may also be an RLS
 * denial or nonexistent stream. Require a server-confirmed ended state.
 */
export async function confirmLiveStreamEnded(
  update: () => Promise<UpdateResult>,
  readStatus: () => Promise<StatusResult>,
): Promise<boolean> {
  try {
    const updated = await update();
    if (!updated || updated.error) return false;
    if (updated.data?.id) return true;

    const status = await readStatus();
    return Boolean(status && !status.error && status.data?.is_live === false);
  } catch (error) {
    console.error('Live stream end confirmation failed:', error);
    return false;
  }
}

