/**
 * Merge the most recent stream_chat rows with messages already delivered by
 * Realtime or added optimistically while the history request was in flight.
 *
 * Use server timestamps to order persisted messages: a visibility-triggered
 * history refresh can contain newer rows than the current local array.
 * Local unsaved bubbles have no server timestamp and stay at the bottom.
 * The existing live item takes precedence when both sides have the same ID.
 */
export function mergeStreamChatHistory<T extends {
  id: string;
  created_at?: string | null;
}>(
  history: readonly T[],
  current: readonly T[],
  limit = 30,
): T[] {
  const byId = new Map<string, T>();
  for (const message of history) byId.set(message.id, message);
  for (const message of current) byId.set(message.id, message);

  const ordered = Array.from(byId.values()).sort((left, right) => {
    if (!left.created_at) return right.created_at ? 1 : 0;
    if (!right.created_at) return -1;
    return left.created_at.localeCompare(right.created_at);
  });
  return ordered.slice(-Math.max(0, limit));
}
