/**
 * Keep only a pending call-chat UUID, a SHA-256 fingerprint of its normalized
 * draft, and an expiry timestamp in the current browser tab's sessionStorage.
 * The message text itself is never stored here. A fingerprint is not
 * encryption, but it avoids retaining plaintext drafts in session storage.
 *
 * If storage/crypto is disabled, callers fall back to in-memory retries.
 * A bounded TTL also limits stale IDs surviving a resumed browser session.
 */
export const CALL_CHAT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

export type CallChatAttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type CallChatAttemptPersistence = {
  load: (message: string) => Promise<string | null>;
  save: (id: string, message: string) => Promise<void>;
  clear: (id: string) => void;
};

async function messageFingerprint(message: string): Promise<string> {
  const bytes = new TextEncoder().encode(message);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer), byte =>
    byte.toString(16).padStart(2, '0')).join('');
}

export function createSessionCallChatAttemptStore(
  storage: CallChatAttemptStorage | null,
  key: string,
  now: () => number = Date.now,
): CallChatAttemptPersistence {
  const loadSaved = (): { id: string; fingerprint: string; savedAt: number } | null => {
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object') throw Error('invalid stored attempt');
      const saved = value as Record<string, unknown>;
      if (
        typeof saved.id !== 'string' || !saved.id || saved.id.length > 128 ||
        typeof saved.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(saved.fingerprint) ||
        typeof saved.savedAt !== 'number' || !Number.isFinite(saved.savedAt) ||
        now() < saved.savedAt || now() - saved.savedAt > CALL_CHAT_ATTEMPT_TTL_MS
      ) throw Error('invalid or expired stored attempt');
      return { id: saved.id, fingerprint: saved.fingerprint, savedAt: saved.savedAt };
    } catch {
      storage.removeItem(key);
      return null;
    }
  };

  return {
    async load(message) {
      try {
        const saved = loadSaved();
        if (!saved) return null;
        return saved.fingerprint === await messageFingerprint(message) ? saved.id : null;
      } catch {
        return null;
      }
    },
    async save(id, message) {
      try {
        if (!storage) return;
        const fingerprint = await messageFingerprint(message);
        storage.setItem(key, JSON.stringify({ id, fingerprint, savedAt: now() }));
      } catch {
        // Storage/crypto can be blocked by browser policy or private browsing.
      }
    },
    clear(id) {
      try {
        // A late acknowledgement from an older component must never erase
        // a newer attempt with a different ID in the same browser tab.
        if (loadSaved()?.id === id) storage?.removeItem(key);
      } catch {
        // Never turn a confirmed database write into a failed UI send.
      }
    },
  };
}
