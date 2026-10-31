import { supabase } from '../supabase';

import { confirmLiveStreamEnded } from './liveStreamEndConfirmation';

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
