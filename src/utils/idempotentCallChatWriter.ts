/**
 * Send a call-chat message with a stable client-generated database UUID until
 * its outcome is confirmed. A POST may have committed before the browser
 * loses its response: trying again with a *new* UUID would duplicate the chat.
 *
 * Caller should use INSERT ... ON CONFLICT (id) DO NOTHING, then SELECT by
 * this ID and match/sender (RLS). No schema migration or privileged RPC.
 * A distinct, successfully confirmed send gets a new UUID, even for same text.
 * Serial requests are enforced by createCallMessageSender.
 */
export function createIdempotentCallChatWriter<T extends {
  id: string;
  message: string;
}>(
  createId: () => string,
  insertOnce: (id: string, message: string) => Promise<{ data?: T | null; error?: unknown } | null>,
  findSaved: (id: string) => Promise<{ data?: T | null; error?: unknown } | null>,
) {
  let pending: { id: string; message: string } | null = null;

  const matchesAttempt = (
    row: T | null | undefined,
    attempt: { id: string; message: string },
  ): row is T => Boolean(row && row.id === attempt.id && row.message === attempt.message);

  return {
    async persist(message: string): Promise<{ data: T | null; error: unknown | null }> {
      if (!pending || pending.message !== message) {
        pending = { id: createId(), message };
      }
      const attempt = pending;
      let failure: unknown = new Error('Call chat insert could not be confirmed');

      try {
        const inserted = await insertOnce(attempt.id, attempt.message);
        if (!inserted?.error && matchesAttempt(inserted?.data, attempt)) {
          pending = null;
          return { data: inserted.data!, error: null };
        }
        failure = inserted?.error ?? failure;
      } catch (error) {
        failure = error;
      }

      // Check the exact ID in case the write committed but its response was
      // lost, or an idempotent conflict was intentionally ignored.
      try {
        const existing = await findSaved(attempt.id);
        if (!existing?.error && matchesAttempt(existing?.data, attempt)) {
          pending = null;
          return { data: existing.data!, error: null };
        }
        failure = existing?.error ?? failure;
      } catch (error) {
        failure = error;
      }

      // Preserve the original ID for a retry of the same draft. Fail closed:
      // a missing/unauthorized/different row never counts as "sent".
      return { data: null, error: failure };
    },
  };
}
