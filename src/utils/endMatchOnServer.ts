import { supabase } from '../supabase';
import { confirmMatchEnded } from './confirmMatchEnded';

/**
 * Only participants can finish active matches (protected by Supabase RLS).
 * A zero-row UPDATE must be verified as ended; failed RPCs and thrown network
 * errors never allow the UI to claim the call was safely ended.
 */
export async function endMatchOnServer(matchId: string): Promise<boolean> {
  if (!matchId) return false;

  return confirmMatchEnded(
    async () => {
      const { data, error } = await supabase
        .from('matches')
        .update({ status: 'ended' })
        .eq('id', matchId)
        .eq('status', 'active')
        .select('id')
        .maybeSingle();
      return { data, error };
    },
    async () => {
      // The other participant may have ended the call concurrently.
      const { data, error } = await supabase
        .from('matches')
        .select('status')
        .eq('id', matchId)
        .maybeSingle();
      return { data, error };
    },
  );
}
