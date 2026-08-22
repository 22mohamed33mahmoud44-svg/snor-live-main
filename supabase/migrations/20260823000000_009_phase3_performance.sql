/*
# Migration 009: Phase 3 — Performance & Safety
# ===============================================
# 1. public.chat_rate_limits    — sliding-window rate limit for stream chat
# 2. send_chat_message()        — rate-limited chat RPC (max 10 msg/min)
# 3. cleanup_chat_rate_limits() — scheduled cleanup (pg_cron every 5 min)
# 4. public.reports             — user/stream reporting system
# 5. submit_report()            — dedup-safe report submission RPC
# 6. Performance indexes on stream_chat, live_streams, follows, transactions, gifts, messages
*/

-- ── 1. chat_rate_limits ──
CREATE TABLE IF NOT EXISTS public.chat_rate_limits (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id    UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
  msg_count    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, stream_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_chat_rate_user_stream ON public.chat_rate_limits(user_id, stream_id, window_start DESC);
ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_rate no client access" ON public.chat_rate_limits;
CREATE POLICY "chat_rate no client access" ON public.chat_rate_limits
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ── 2. send_chat_message() ──
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_stream_id UUID,
  p_message   TEXT,
  p_username  TEXT DEFAULT 'متابع'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_window    TIMESTAMPTZ := date_trunc('minute', NOW());
  v_count     INTEGER;
  v_msg_id    UUID;
  v_is_banned BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF length(trim(p_message)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_message');
  END IF;
  IF length(p_message) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_too_long');
  END IF;
  SELECT EXISTS(SELECT 1 FROM stream_bans WHERE stream_id = p_stream_id AND user_id = v_user_id)
  INTO v_is_banned;
  IF v_is_banned THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_banned');
  END IF;
  INSERT INTO chat_rate_limits (user_id, stream_id, window_start, msg_count)
  VALUES (v_user_id, p_stream_id, v_window, 1)
  ON CONFLICT (user_id, stream_id, window_start)
  DO UPDATE SET msg_count = chat_rate_limits.msg_count + 1
  RETURNING msg_count INTO v_count;
  IF v_count > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited', 'retry_after', 60);
  END IF;
  INSERT INTO stream_chat (stream_id, user_id, username, message)
  VALUES (p_stream_id, v_user_id, p_username, trim(p_message))
  RETURNING id INTO v_msg_id;
  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id, 'msg_count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT, TEXT) TO authenticated;

-- ── 3. cleanup_chat_rate_limits() ──
CREATE OR REPLACE FUNCTION public.cleanup_chat_rate_limits()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM chat_rate_limits WHERE window_start < NOW() - INTERVAL '5 minutes';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_chat_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_chat_rate_limits() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-chat-rate-limits', '*/5 * * * *',
      'SELECT public.cleanup_chat_rate_limits()');
  END IF;
END;
$$;

-- ── 4. reports table ──
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id   UUID REFERENCES public.live_streams(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN (
                'spam','harassment','inappropriate_content','hate_speech','scam','other')),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','reviewed','dismissed','actioned')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT report_has_target CHECK (reported_id IS NOT NULL OR stream_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON public.reports(status, created_at DESC);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports insert own" ON public.reports;
CREATE POLICY "reports insert own" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "reports read own" ON public.reports;
CREATE POLICY "reports read own" ON public.reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
REVOKE UPDATE, DELETE ON public.reports FROM anon, authenticated;

-- ── 5. submit_report() ──
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reported_id UUID DEFAULT NULL,
  p_stream_id   UUID DEFAULT NULL,
  p_reason      TEXT DEFAULT 'other',
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter UUID := auth.uid();
  v_exists   BOOLEAN;
BEGIN
  IF v_reporter IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_reported_id IS NULL AND p_stream_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_target');
  END IF;
  IF p_reported_id = v_reporter THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_report_self');
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM reports
    WHERE reporter_id = v_reporter
      AND (reported_id = p_reported_id OR stream_id = p_stream_id)
      AND created_at > NOW() - INTERVAL '24 hours'
  ) INTO v_exists;
  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_reported');
  END IF;
  INSERT INTO reports (reporter_id, reported_id, stream_id, reason, description)
  VALUES (v_reporter, p_reported_id, p_stream_id, p_reason, p_description);
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_report(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── 6. Performance Indexes ──
CREATE INDEX IF NOT EXISTS idx_stream_chat_created    ON public.stream_chat(stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_is_live   ON public.live_streams(is_live, created_at DESC) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS idx_follows_following       ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type  ON public.transactions(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_sender            ON public.gifts(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_match_created  ON public.messages(match_id, created_at DESC);
