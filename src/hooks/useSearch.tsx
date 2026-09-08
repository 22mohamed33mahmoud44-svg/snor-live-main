import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

export function useSearch() {
  const [profileResults, setProfileResults] = useState<any[]>([]);
  const [streamResults, setStreamResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setProfileResults([]);
      setStreamResults([]);
      return;
    }
    setLoading(true);
    const [{ data: profiles }, { data: streams }] = await Promise.all([
      supabase.rpc('search_profiles', { p_query: query, p_limit: 20 }),
      supabase.rpc('search_streams',  { p_query: query, p_limit: 20 }),
    ]);
    setProfileResults(profiles || []);
    setStreamResults(streams || []);
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setProfileResults([]);
    setStreamResults([]);
  }, []);

  return { profileResults, streamResults, loading, search, clear };
}
