import type { CallChatAttemptPersistence } from './sessionCallChatAttemptStore';

/**
 * A write may commit but lose its network acknowledgement. Keep its UUID for
 * retries, and bound any unresolved INSERT or recovery SELECT so the composer
 * cannot become permanently locked. Aborted/late results never confirm or
 * clear a pending UUID from a newer attempt.
 */
export const CALL_CHAT_SEND_TIMEOUT_MS = 20_000;

type PersistedResponse<T> = { data?: T | null; error?: unknown } | null;
type SendResult<T> = { data: T | null; error: unknown | null };

export function createIdempotentCallChatWriter<T extends {
  id: string;
  message: string;
}>(
  createId: () => string,
  insertOnce: (id: string, message: string, signal: AbortSignal) => Promise<PersistedResponse<T>>,
  findSaved: (id: string, signal: AbortSignal) => Promise<PersistedResponse<T>>,
  persistence?: CallChatAttemptPersistence,
  timeoutMs = CALL_CHAT_SEND_TIMEOUT_MS,
) {
  let pending: { id: string; message: string } | null = null;

  const matchesAttempt = (
    row: T | null | undefined,
    attempt: { id: string; message: string },
  ): row is T => Boolean(row && row.id === attempt.id && row.message === attempt.message);

  return {
    async persist(message: string): Promise<SendResult<T>> {
      if (!pending || pending.message !== message) {
        // Reuse the exact ID on retry, including after a same-tab refresh.
        let storedId: string | null = null;
        try { storedId = await persistence?.load(message) ?? null; } catch { /* storage optional */ }
        pending = { id: storedId ?? createId(), message };
        // Store the UUID before the write: its response may never arrive.
        try { await persistence?.save(pending.id, message); } catch { /* storage optional */ }
      }
      const attempt = pending;
      const controller = new AbortController();
      const timeoutError = new Error('Call chat send timed out; delivery is unconfirmed');
      const failed = (error: unknown): SendResult<T> => ({ data: null, error });

      let onAbort!: () => void;
      const aborted = new Promise<SendResult<T>>(resolve => {
        onAbort = () => resolve(failed(timeoutError));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const deadline = setTimeout(() => controller.abort(), timeoutMs);

      const writeAndConfirm = async (): Promise<SendResult<T>> => {
        let failure: unknown = new Error('Call chat insert could not be confirmed');
        try {
          const inserted = await insertOnce(attempt.id, attempt.message, controller.signal);
          // An already timed-out insert can complete later; never clear its
          // UUID or show "sent", because a new retry may be in progress.
          if (controller.signal.aborted) return failed(timeoutError);
          if (!inserted?.error && matchesAttempt(inserted?.data, attempt)) {
            if (pending?.id === attempt.id) pending = null;
            try { persistence?.clear(attempt.id); } catch { /* storage optional */ }
            return { data: inserted.data!, error: null };
          }
          failure = inserted?.error ?? failure;
        } catch (error) {
          failure = error;
        }

        if (controller.signal.aborted) return failed(timeoutError);
        try {
          // If the write committed before its response was lost, recover by
          // exact UUID + match/user scoped SELECT under RLS.
          const existing = await findSaved(attempt.id, controller.signal);
          if (controller.signal.aborted) return failed(timeoutError);
          if (!existing?.error && matchesAttempt(existing?.data, attempt)) {
            if (pending?.id === attempt.id) pending = null;
            try { persistence?.clear(attempt.id); } catch { /* storage optional */ }
            return { data: existing.data!, error: null };
          }
          failure = existing?.error ?? failure;
        } catch (error) {
          failure = error;
        }

        return controller.signal.aborted ? failed(timeoutError) : failed(failure);
      };

      try {
        // Promise.race settles on abort even when the underlying network
        // stack ignores AbortSignal. The losing promise remains observed.
        return await Promise.race([writeAndConfirm(), aborted]);
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
