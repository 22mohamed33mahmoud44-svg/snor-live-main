import { supabase } from '../supabase';

/**
 * Only participants can finish active matches (protected by Supabase RLS).
 * A 0-row UPDATE is NOT proof that the match ended: verify the server status.
 * Prevent a failed or unauthorized update from leaving an orphaned active call.
 */
export async function endMatchOnServer(matchId: string): Promise<boolean> {
  const { data: ended, error: updateError } = await supabase
    .from('matches')
    .update({ status: 'ended' })
    .eq('id', matchId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('Failed to end active call', updateError);
    return false;
  }
  if (ended) return true;

  // The other participant may have ended the call concurrently.
  const { data: existing, error: readError } = await supabase
    .from('matches')
    .select('status')
    .eq('id', matchId)
    .maybeSingle();
  if (readError) {
    console.error('Could not verify ended call status', readError);
    return false;
  }
  return existing?.status === 'ended';
}
