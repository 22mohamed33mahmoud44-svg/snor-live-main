import { supabase } from '../supabase';

type UpdateResult = { data: { id: string } | null; error?: unknown };
type StatusResult = { data: { is_live: boolean } | null; error?: unknown };

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

/**
 * Only the owner may end their broadcast. Supabase table privileges and RLS
 * remain authoritative; both update and verification are owner-scoped.
 */
export async function endLiveStreamOnServer(streamId: string, ownerId: string): Promise<boolean> {
  if (!streamId || !ownerId) return false;

  return confirmLiveStreamEnded(
    async () => {
      const { data, error } = await supabase
        .from('live_streams')
        .update({ is_live: false, last_heartbeat_at: new Date().toISOString() })
        .eq('id', streamId)
        .eq('user_id', ownerId)
        .eq('is_live', true)
        .select('id')
        .maybeSingle();
      return { data, error };
    },
    async () => {
      const { data, error } = await supabase
        .from('live_streams')
        .select('is_live')
        .eq('id', streamId)
        .eq('user_id', ownerId)
        .maybeSingle();
      return { data, error };
    },
  );
}
