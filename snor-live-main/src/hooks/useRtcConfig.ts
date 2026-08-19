import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { STUN_SERVERS } from '../constants/iceServers';
import { logError } from '../utils/logError';

export function useRtcConfig() {
  const [rtcConfig, setRtcConfig] = useState<RTCConfiguration>({
    iceServers: STUN_SERVERS,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchTurnCredentials() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) logError('useRtcConfig.getSession', sessionError);
        if (!session) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-turn-credentials`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (!res.ok) {
          logError('useRtcConfig.getTurnCredentials', new Error(`TURN endpoint responded ${res.status}`));
          return;
        }

        const { iceServers } = await res.json();
        if (!cancelled && iceServers?.length) {
          setRtcConfig({ iceServers: [...STUN_SERVERS, ...iceServers] });
        }
      } catch (error) {
        // الاتصال يكمل بـ STUN فقط، لكن السبب يجب أن يظهر في السجلات
        logError('useRtcConfig.getTurnCredentials', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTurnCredentials();
    return () => { cancelled = true; };
  }, []);

  return { rtcConfig, loading };
}