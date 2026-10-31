// Treat a Supabase write failure as a recoverable chat error. Keep the
// draft in the UI until the server confirms the insert succeeded.
export type CallMessageOutcome<TData = unknown> = {
  status: 'sent' | 'failed' | 'empty' | 'busy';
  text: string;
  // An INSERT ... SELECT response can include the persisted server row.
  // Callers can replace optimistic UI IDs without relying on Realtime.
  data?: TData;
};

type InsertResponse<TData> = { error?: unknown; data?: TData | null } | null | undefined;

export function createCallMessageSender<TData = unknown>(
  persist: (message: string) => Promise<InsertResponse<TData>>,
) {
  let sending = false;

  return {
    isSending: () => sending,
    async send(draft: string): Promise<CallMessageOutcome<TData>> {
      const text = draft.trim();
      if (!text) return { status: 'empty', text };
      if (sending) return { status: 'busy', text };

      sending = true;
      try {
        const result = await persist(text);
        if (!result || result.error) {
          return { status: 'failed', text };
        }
        return { status: 'sent', text, data: result.data ?? undefined };
      } catch {
        return { status: 'failed', text };
      } finally {
        sending = false;
      }
    },
  };
}
