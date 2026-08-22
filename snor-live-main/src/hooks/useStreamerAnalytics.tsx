import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useStreamerAnalytics(days = 30) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_streamer_analytics', { p_days: days });
    if (!error) setAnalytics(data);
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
}
