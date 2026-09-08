import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { STUN_SERVERS } from '../constants/iceServers';

export function useRtcConfig() {
  const [rtcConfig, setRtcConfig] = useState<RTCConfiguration>({
    iceServers: STUN_SERVERS,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchTurnCredentials() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-turn-credentials`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (!res.ok) return;

        const { iceServers } = await res.json();
        if (!cancelled && iceServers?.length) {
          setRtcConfig({ iceServers: [...STUN_SERVERS, ...iceServers] });
        }
      } catch {
        // fallback لـ STUN فقط — لا نكشف شيء
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTurnCredentials();
    return () => { cancelled = true; };
  }, []);

  return { rtcConfig, loading };
}