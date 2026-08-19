import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

interface UseLiveKitTokenOptions {
  room: string;
  username: string;
  isStreamer: boolean;
  /** أي تغيير في هذه القيمة يعيد جلب التوكن (لإعادة المحاولة). */
  retryKey?: number;
  onError?: (error: unknown) => void;
}

interface UseLiveKitTokenResult {
  token: string | null;
  isLoading: boolean;
}

/** يجلب توكن LiveKit من الـ Edge Function ويتجاهل النتيجة عند تفكيك المكوّن. */
export function useLiveKitToken({
  room,
  username,
  isStreamer,
  retryKey = 0,
  onError,
}: UseLiveKitTokenOptions): UseLiveKitTokenResult {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let isCancelled = false;
    setToken(null);
    setIsLoading(true);

    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { room, username, isStreamer },
        });

        if (isCancelled) return;
        if (error) throw error;
        if (!data?.token) throw new Error('تعذر استلام مفتاح الاتصال بالبث');

        setToken(data.token);
      } catch (error) {
        if (isCancelled) return;
        console.error('LiveKit token request failed:', error);
        onErrorRef.current?.(error);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void fetchToken();

    return () => { isCancelled = true; };
  }, [room, username, isStreamer, retryKey]);

  return { token, isLoading };
}
