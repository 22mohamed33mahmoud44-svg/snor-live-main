import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useMissions() {
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMissions = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_missions');
    if (!error) setMissions(data || []);
    setLoading(false);
  }, []);

  const claimReward = useCallback(async (missionId: string) => {
    const { data, error } = await supabase.rpc('claim_mission_reward', { p_mission_id: missionId });
    if (!error && data?.success) {
      setMissions(prev => prev.map(m =>
        m.mission_id === missionId ? { ...m, reward_claimed: true } : m
      ));
    }
    return { data, error };
  }, []);

  const updateProgress = useCallback(async (action: string, increment = 1) => {
    await supabase.rpc('update_mission_progress', { p_action: action, p_increment: increment });
    await fetchMissions();
  }, [fetchMissions]);

  useEffect(() => { fetchMissions(); }, [fetchMissions]);

  const completed = missions.filter(m => m.is_completed && !m.reward_claimed);
  const inProgress = missions.filter(m => !m.is_completed);

  return { missions, completed, inProgress, loading, claimReward, updateProgress, refetch: fetchMissions };
}
