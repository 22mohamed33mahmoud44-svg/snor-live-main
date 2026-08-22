import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

export function useDailyBonus() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const claimBonus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('claim_daily_bonus', { p_user_id: user.id });
    setResult(data);
    setLoading(false);
    return { data, error };
  }, []);

  return { result, loading, claimBonus };
}
