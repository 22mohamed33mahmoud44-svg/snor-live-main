import { useEffect } from 'react';
import { supabase } from '../supabase';

// Pings the server every 60 seconds to mark user as online
export function useOnlineStatus() {
  useEffect(() => {
    const ping = async () => {
      await supabase.rpc('update_last_seen');
    };

    ping(); // immediate ping on mount
    const interval = setInterval(ping, 60_000);
    return () => clearInterval(interval);
  }, []);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('is_user_online', { p_user_id: userId });
  return data || false;
}
