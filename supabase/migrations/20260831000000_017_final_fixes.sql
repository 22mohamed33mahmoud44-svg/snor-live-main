/*
# Migration 017: Final Fixes & Hardening
# ========================================
# 1. RLS on app_private.stream_like_rate (was missing!)
# 2. Drop duplicate function overloads (increment_stream_likes, send_stream_gift)
# 3. populate_streamer_stats() — daily cron at 00:30 to fill analytics
*/

-- ── 1. RLS on app_private.stream_like_rate ──
ALTER TABLE app_private.stream_like_rate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stream_like_rate read own"   ON app_private.stream_like_rate;
CREATE POLICY "stream_like_rate read own" ON app_private.stream_like_rate
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "stream_like_rate insert own" ON app_private.stream_like_rate;
CREATE POLICY "stream_like_rate insert own" ON app_private.stream_like_rate
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stream_like_rate update own" ON app_private.stream_like_rate;
CREATE POLICY "stream_like_rate update own" ON app_private.stream_like_rate
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

REVOKE DELETE ON app_private.stream_like_rate FROM anon, authenticated;

-- ── 2. Drop duplicate overloads ──
DROP FUNCTION IF EXISTS public.increment_stream_likes(uuid);
DROP FUNCTION IF EXISTS public.send_stream_gift(uuid, text, integer);

-- ── 3. populate_streamer_stats() ──
CREATE OR REPLACE FUNCTION public.populate_streamer_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.streamer_stats (
    streamer_id, stat_date, total_streams, gifts_received, coins_earned, new_followers
  )
  SELECT
    ls.user_id,
    CURRENT_DATE - 1,
    COUNT(DISTINCT ls.id),
    COUNT(DISTINCT gl.id),
    COALESCE(SUM(gl.coin_cost), 0),
    (SELECT COUNT(*) FROM public.follows f
     WHERE f.following_id = ls.user_id AND f.created_at::date = CURRENT_DATE - 1)
  FROM public.live_streams ls
  LEFT JOIN public.gift_logs gl
    ON gl.stream_id = ls.id AND gl.created_at::date = CURRENT_DATE - 1
  WHERE ls.created_at::date = CURRENT_DATE - 1
  GROUP BY ls.user_id
  ON CONFLICT (streamer_id, stat_date) DO UPDATE SET
    total_streams  = EXCLUDED.total_streams,
    gifts_received = EXCLUDED.gifts_received,
    coins_earned   = EXCLUDED.coins_earned,
    new_followers  = EXCLUDED.new_followers;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.populate_streamer_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.populate_streamer_stats() TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'populate-streamer-stats',
      '30 0 * * *',
      'SELECT public.populate_streamer_stats()'
    );
  END IF;
END; $$;
