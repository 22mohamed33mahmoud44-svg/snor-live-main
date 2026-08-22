/*
# Migration 011: Phase 5 — Admin Dashboard & Full-Text Search
# =============================================================
# 1. Admin Views (service_role only):
#    - admin_users_overview     — full user stats
#    - admin_streams_overview   — stream analytics
#    - admin_financial_overview — daily coin transactions
#    - admin_reports_queue      — pending moderation reports
#    - admin_withdrawals_queue  — withdrawal requests
#
# 2. Moderation RPCs (service_role only):
#    - process_report()         — review/dismiss/action a report
#    - admin_ban_user()         — global user ban with notification
#    - process_withdrawal()     — approve/reject withdrawal + notify user
#
# 3. Full-Text Search:
#    - search_vector column on profiles + live_streams
#    - GIN indexes for fast full-text queries
#    - search_profiles() RPC
#    - search_streams() RPC
#    - trg_profiles_search_vector — auto-update trigger
*/

-- ── 1. Admin Views ──

CREATE OR REPLACE VIEW public.admin_users_overview AS
SELECT u.id, u.email, u.created_at AS registered_at, u.last_sign_in_at, u.banned_until,
       p.username, p.full_name, p.gender, p.followers_count, p.following_count,
       p.streams_count, p.streak_days, COALESCE(uc.coins, 0) AS coin_balance,
       COUNT(DISTINCT ls.id) AS total_streams,
       COUNT(DISTINCT m.id) AS total_matches,
       COUNT(DISTINCT t.id) AS total_transactions
FROM auth.users u
LEFT JOIN app_private.profiles p ON p.id = u.id
LEFT JOIN public.users_coins uc ON uc.user_id = u.id
LEFT JOIN public.live_streams ls ON ls.user_id = u.id
LEFT JOIN public.matches m ON (m.user1 = u.id OR m.user2 = u.id)
LEFT JOIN public.transactions t ON t.user_id = u.id
GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at, u.banned_until,
         p.username, p.full_name, p.gender, p.followers_count, p.following_count,
         p.streams_count, p.streak_days, uc.coins;
REVOKE ALL ON public.admin_users_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_users_overview TO service_role;

CREATE OR REPLACE VIEW public.admin_streams_overview AS
SELECT ls.id AS stream_id, ls.title, ls.category, ls.is_live, ls.viewers_count, ls.likes_count,
       ls.created_at, ls.last_heartbeat_at, p.username AS streamer_name, p.followers_count AS streamer_followers,
       COUNT(DISTINCT sc.id) AS chat_messages, COUNT(DISTINCT gl.id) AS gifts_received,
       COALESCE(SUM(gl.coin_cost), 0) AS total_coins_earned, COUNT(DISTINCT sb.id) AS users_banned
FROM public.live_streams ls
LEFT JOIN app_private.profiles p ON p.id = ls.user_id
LEFT JOIN public.stream_chat sc ON sc.stream_id = ls.id
LEFT JOIN public.gift_logs gl ON gl.stream_id = ls.id
LEFT JOIN public.stream_bans sb ON sb.stream_id = ls.id
GROUP BY ls.id, ls.title, ls.category, ls.is_live, ls.viewers_count, ls.likes_count,
         ls.created_at, ls.last_heartbeat_at, p.username, p.followers_count;
REVOKE ALL ON public.admin_streams_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_streams_overview TO service_role;

CREATE OR REPLACE VIEW public.admin_financial_overview AS
SELECT DATE_TRUNC('day', t.created_at) AS day, t.type,
       COUNT(*) AS transaction_count, SUM(t.amount) AS total_coins,
       COUNT(DISTINCT t.user_id) AS unique_users
FROM public.transactions t
GROUP BY DATE_TRUNC('day', t.created_at), t.type
ORDER BY day DESC, t.type;
REVOKE ALL ON public.admin_financial_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_financial_overview TO service_role;

CREATE OR REPLACE VIEW public.admin_reports_queue AS
SELECT r.id AS report_id, r.reason, r.description, r.status, r.created_at,
       reporter.username AS reporter_username, reported.username AS reported_username,
       ls.title AS stream_title
FROM public.reports r
LEFT JOIN app_private.profiles reporter ON reporter.id = r.reporter_id
LEFT JOIN app_private.profiles reported ON reported.id = r.reported_id
LEFT JOIN public.live_streams ls ON ls.id = r.stream_id
ORDER BY r.created_at DESC;
REVOKE ALL ON public.admin_reports_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_reports_queue TO service_role;

CREATE OR REPLACE VIEW public.admin_withdrawals_queue AS
SELECT w.id, w.coins, w.usd_amount, w.method, w.account_info, w.status, w.admin_note,
       w.requested_at, w.processed_at, p.username, p.full_name, uc.coins AS current_balance
FROM public.withdrawals w
LEFT JOIN app_private.profiles p ON p.id = w.user_id
LEFT JOIN public.users_coins uc ON uc.user_id = w.user_id
ORDER BY w.requested_at DESC;
REVOKE ALL ON public.admin_withdrawals_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_withdrawals_queue TO service_role;

-- ── 2. Moderation RPCs ──

CREATE OR REPLACE FUNCTION public.process_report(p_report_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('reviewed','dismissed','actioned') THEN
    RETURN jsonb_build_object('success',false,'error','invalid_status');
  END IF;
  UPDATE reports SET status = p_status WHERE id = p_report_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','report_not_found'); END IF;
  RETURN jsonb_build_object('success',true,'status',p_status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.process_report(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_report(UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_user_id UUID, p_ban_until TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE auth.users SET banned_until = COALESCE(p_ban_until,'infinity'::timestamptz) WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','user_not_found'); END IF;
  INSERT INTO notifications (user_id,type,title,body)
  VALUES (p_user_id,'system','تم تعليق حسابك','تم تعليق حسابك بسبب مخالفة شروط الاستخدام.');
  RETURN jsonb_build_object('success',true,'banned_until',p_ban_until);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID,TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.process_withdrawal(p_withdrawal_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_withdrawal withdrawals%ROWTYPE;
BEGIN
  IF p_status NOT IN ('processing','paid','rejected') THEN
    RETURN jsonb_build_object('success',false,'error','invalid_status');
  END IF;
  SELECT * INTO v_withdrawal FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','withdrawal_not_found'); END IF;
  UPDATE withdrawals SET status=p_status, admin_note=p_note, processed_at=NOW() WHERE id=p_withdrawal_id;
  INSERT INTO notifications (user_id,type,title,body,data) VALUES (
    v_withdrawal.user_id,'system',
    CASE WHEN p_status='paid' THEN '✅ تم تحويل مبلغ السحب' ELSE '❌ تم رفض طلب السحب' END,
    p_note,
    jsonb_build_object('withdrawal_id',p_withdrawal_id,'status',p_status,'usd_amount',v_withdrawal.usd_amount)
  );
  RETURN jsonb_build_object('success',true,'status',p_status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(UUID,TEXT,TEXT) TO service_role;

-- ── 3. Full-Text Search ──

ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE app_private.profiles SET search_vector = to_tsvector('simple', COALESCE(username,'') || ' ' || COALESCE(full_name,''));
CREATE INDEX IF NOT EXISTS idx_profiles_search ON app_private.profiles USING GIN(search_vector);

ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE public.live_streams SET search_vector = to_tsvector('simple', COALESCE(title,'') || ' ' || COALESCE(streamer_name,''));
CREATE INDEX IF NOT EXISTS idx_live_streams_search ON public.live_streams USING GIN(search_vector);

CREATE OR REPLACE FUNCTION public.search_profiles(p_query TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (id UUID, username TEXT, full_name TEXT, avatar_url TEXT, followers_count INT, is_online BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.username, p.full_name, p.avatar_url, p.followers_count,
           (p.last_seen_at > NOW() - INTERVAL '5 minutes' AND NOT COALESCE(p.hide_online,false)) AS is_online
    FROM app_private.profiles p
    WHERE p.search_vector @@ plainto_tsquery('simple', p_query) OR p.username ILIKE '%'||p_query||'%'
    ORDER BY p.followers_count DESC LIMIT p_limit;
END; $$;
GRANT EXECUTE ON FUNCTION public.search_profiles(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_streams(p_query TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (id UUID, title TEXT, streamer_name TEXT, category TEXT, viewers_count INT, likes_count INT, thumbnail_url TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT ls.id, ls.title, ls.streamer_name, ls.category, ls.viewers_count, ls.likes_count, ls.thumbnail_url
    FROM public.live_streams ls
    WHERE ls.is_live = true
      AND (ls.search_vector @@ plainto_tsquery('simple', p_query) OR ls.title ILIKE '%'||p_query||'%')
    ORDER BY ls.viewers_count DESC LIMIT p_limit;
END; $$;
GRANT EXECUTE ON FUNCTION public.search_streams(TEXT, INT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.update_profiles_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.username,'') || ' ' || COALESCE(NEW.full_name,''));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_profiles_search_vector ON app_private.profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE OF username, full_name ON app_private.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_search_vector();
