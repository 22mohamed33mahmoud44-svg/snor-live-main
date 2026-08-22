import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useVIP() {
  const [vipData, setVipData] = useState<any>(null);
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVIP = useCallback(async () => {
    const [{ data: vip }, { data: prices }] = await Promise.all([
      supabase.rpc('get_my_vip'),
      supabase.from('vip_pricing').select('*').eq('is_active', true).order('coins_cost'),
    ]);
    setVipData(vip);
    setPricing(prices || []);
    setLoading(false);
  }, []);

  const subscribe = useCallback(async (pricingId: string) => {
    const { data, error } = await supabase.rpc('subscribe_vip', { p_pricing_id: pricingId });
    if (!error && data?.success) await fetchVIP();
    return { data, error };
  }, [fetchVIP]);

  useEffect(() => { fetchVIP(); }, [fetchVIP]);

  return {
    vipData,
    pricing,
    loading,
    isVIP: vipData?.has_vip || false,
    tier: vipData?.tier || null,
    daysRemaining: vipData?.days_remaining || 0,
    features: vipData?.features || [],
    subscribe,
    refetch: fetchVIP,
  };
}
