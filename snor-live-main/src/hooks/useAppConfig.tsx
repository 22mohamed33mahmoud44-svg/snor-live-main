import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

let cachedConfig: any = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useAppConfig() {
  const [config, setConfig] = useState<Record<string, any>>(cachedConfig || {});
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) {
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }
    supabase.rpc('get_app_config').then(({ data }) => {
      if (data) {
        cachedConfig = data;
        cacheTime = Date.now();
        setConfig(data);
      }
      setLoading(false);
    });
  }, []);

  const get = (key: string, defaultVal?: any) => config[key] ?? defaultVal;

  return { config, loading, get };
}
