import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useBoost() {
  const [packages, setPackages] = useState<any[]>([]);
  const [boostedProfiles, setBoostedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPackages = useCallback(async () => {
    const { data } = await supabase
      .from('boost_packages')
      .select('*')
      .eq('is_active', true)
      .order('coins_cost');
    setPackages(data || []);
    setLoading(false);
  }, []);

  const fetchBoosted = useCallback(async (boostType = 'home_page') => {
    const { data } = await supabase.rpc('get_boosted_profiles', {
      p_boost_type: boostType,
      p_limit: 10,
    });
    setBoostedProfiles(data || []);
  }, []);

  const boostProfile = useCallback(async (packageId: string) => {
    const { data, error } = await supabase.rpc('boost_profile', { p_package_id: packageId });
    return { data, error };
  }, []);

  useEffect(() => {
    fetchPackages();
    fetchBoosted();
  }, [fetchPackages, fetchBoosted]);

  return { packages, boostedProfiles, loading, boostProfile, fetchBoosted };
}
