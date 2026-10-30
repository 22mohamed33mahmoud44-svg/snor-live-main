// Treat a Supabase write failure as a recoverable chat error. Keep the
// draft in the UI until the server confirms the insert succeeded.
export type CallMessageOutcome = {
  status: 'sent' | 'failed' | 'empty' | 'busy';
  text: string;
};

type InsertResponse = { error?: unknown } | null | undefined;

export function createCallMessageSender(
  persist: (message: string) => Promise<InsertResponse>,
) {
  let sending = false;

  return {
    isSending: () => sending,
    async send(draft: string): Promise<CallMessageOutcome> {
      const text = draft.trim();
      if (!text) return { status: 'empty', text };
      if (sending) return { status: 'busy', text };

      sending = true;
      try {
        const result = await persist(text);
        if (!result || result.error) {
          return { status: 'failed', text };
        }
        return { status: 'sent', text };
      } catch {
        return { status: 'failed', text };
      } finally {
        sending = false;
      }
    },
  };
}
