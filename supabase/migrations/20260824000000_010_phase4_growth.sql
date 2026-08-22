/*
# Migration 010: Phase 4 — Growth & Engagement Features
# =======================================================
# 1. Leaderboard Materialized Views (top streamers, top gifters, most followed)
# 2. refresh_leaderboards() — scheduled hourly via pg_cron
# 3. Referral System (public.referrals + apply_referral_code RPC)
# 4. Enhanced Daily Streak Bonus (tiered: 10→50 coins based on streak)
# 5. Stream Categories on live_streams
# 6. last_seen_at + update_last_seen() + is_user_online()
# 7. Updated public.profiles view with all new columns
*/

-- ── 1. Leaderboard Materialized Views ──
CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_top_streamers AS
SELECT p.id AS user_id, p.username, p.avatar_url, p.followers_count,
       COALESCE(SUM(gl.coin_cost), 0) AS total_gifts_received,
       COUNT(DISTINCT ls.id) AS total_streams,
       COUNT(DISTINCT gl.sender_id) AS unique_gifters
FROM app_private.profiles p
LEFT JOIN public.live_streams ls ON ls.user_id = p.id
LEFT JOIN public.gift_logs gl ON gl.receiver_id = p.id
GROUP BY p.id, p.username, p.avatar_url, p.followers_count
ORDER BY total_gifts_received DESC;
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_top_streamers_uid ON public.leaderboard_top_streamers(user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_top_gifters AS
SELECT p.id AS user_id, p.username, p.avatar_url,
       COALESCE(SUM(gl.coin_cost), 0) AS total_coins_spent,
       COUNT(gl.id) AS total_gifts_sent,
       COUNT(DISTINCT gl.receiver_id) AS unique_receivers
FROM app_private.profiles p
LEFT JOIN public.gift_logs gl ON gl.sender_id = p.id
GROUP BY p.id, p.username, p.avatar_url
ORDER BY total_coins_spent DESC;
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_top_gifters_uid ON public.leaderboard_top_gifters(user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_most_followed AS
SELECT p.id AS user_id, p.username, p.avatar_url, p.followers_count, p.streams_count,
       COALESCE(SUM(ls.likes_count), 0) AS total_likes
FROM app_private.profiles p
LEFT JOIN public.live_streams ls ON ls.user_id = p.id
GROUP BY p.id, p.username, p.avatar_url, p.followers_count, p.streams_count
ORDER BY p.followers_count DESC;
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_most_followed_uid ON public.leaderboard_most_followed(user_id);

GRANT SELECT ON public.leaderboard_top_streamers TO authenticated, anon;
GRANT SELECT ON public.leaderboard_top_gifters TO authenticated, anon;
GRANT SELECT ON public.leaderboard_most_followed TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.refresh_leaderboards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_top_streamers;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_top_gifters;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_most_followed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_leaderboards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboards() TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('refresh-leaderboards', '0 * * * *', 'SELECT public.refresh_leaderboards()');
  END IF;
END; $$;

-- ── 2. Referral System ──
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8);
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS last_login_date DATE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON app_private.profiles(referral_code);

CREATE TABLE IF NOT EXISTS public.referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_referral CHECK (referrer_id <> referred_id),
  CONSTRAINT unique_referral UNIQUE (referred_id)
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals read own" ON public.referrals;
CREATE POLICY "referrals read own" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_referrer_id UUID; v_user_id UUID := auth.uid(); v_reward INTEGER := 50;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_referrer_id FROM app_private.profiles WHERE referral_code = p_code;
  IF v_referrer_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','invalid_code'); END IF;
  IF v_referrer_id = v_user_id THEN RETURN jsonb_build_object('success',false,'error','cannot_use_own_code'); END IF;
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = v_user_id) THEN
    RETURN jsonb_build_object('success',false,'error','already_used_referral');
  END IF;
  INSERT INTO referrals (referrer_id, referred_id, reward_paid) VALUES (v_referrer_id, v_user_id, true);
  INSERT INTO users_coins (user_id, coins) VALUES (v_referrer_id, v_reward)
    ON CONFLICT (user_id) DO UPDATE SET coins = users_coins.coins + v_reward, updated_at = NOW();
  INSERT INTO transactions (user_id, type, amount, meta)
    VALUES (v_referrer_id, 'earn', v_reward, jsonb_build_object('reason','referral','referred_user',v_user_id));
  INSERT INTO users_coins (user_id, coins) VALUES (v_user_id, 20)
    ON CONFLICT (user_id) DO UPDATE SET coins = users_coins.coins + 20, updated_at = NOW();
  INSERT INTO transactions (user_id, type, amount, meta)
    VALUES (v_user_id, 'bonus', 20, jsonb_build_object('reason','referral_welcome'));
  INSERT INTO notifications (user_id, type, title, data)
    VALUES (v_referrer_id, 'system', 'مكافأة الإحالة! 🎉', jsonb_build_object('coins_earned',v_reward,'referred_user',v_user_id));
  RETURN jsonb_build_object('success',true,'referrer_reward',v_reward,'welcome_bonus',20);
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(TEXT) TO authenticated;

-- ── 3. Enhanced Daily Streak Bonus ──
CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bonus INTEGER; v_streak INTEGER; v_last_login DATE;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT streak_days, last_login_date INTO v_streak, v_last_login FROM app_private.profiles WHERE id = p_user_id;
  IF v_last_login = CURRENT_DATE THEN
    RETURN jsonb_build_object('success',false,'error','already_claimed_today','streak',v_streak);
  END IF;
  IF v_last_login = CURRENT_DATE - INTERVAL '1 day' THEN
    v_streak := COALESCE(v_streak,0) + 1;
  ELSE v_streak := 1; END IF;
  v_bonus := CASE WHEN v_streak>=30 THEN 50 WHEN v_streak>=14 THEN 30 WHEN v_streak>=7 THEN 20 WHEN v_streak>=3 THEN 15 ELSE 10 END;
  UPDATE app_private.profiles SET streak_days=v_streak, last_login_date=CURRENT_DATE WHERE id=p_user_id;
  INSERT INTO users_coins (user_id,coins) VALUES (p_user_id,v_bonus)
    ON CONFLICT (user_id) DO UPDATE SET coins=users_coins.coins+v_bonus, updated_at=NOW();
  INSERT INTO transactions (user_id,type,amount,meta)
    VALUES (p_user_id,'bonus',v_bonus,jsonb_build_object('reason','daily_login','streak',v_streak));
  INSERT INTO daily_bonus_claims (user_id,claimed_on) VALUES (p_user_id,CURRENT_DATE) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success',true,'bonus',v_bonus,'streak',v_streak);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_daily_bonus(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus(UUID) TO authenticated, service_role;

-- ── 4. Stream Categories ──
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'
  CHECK (category IN ('general','entertainment','music','gaming','sports','education','cooking','travel','fashion','other'));
CREATE INDEX IF NOT EXISTS idx_live_streams_category ON public.live_streams(category, is_live) WHERE is_live = true;

-- ── 5. last_seen_at + Online Status ──
ALTER TABLE app_private.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON app_private.profiles(last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE app_private.profiles SET last_seen_at = NOW() WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_user_online(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM app_private.profiles WHERE id=p_user_id
    AND last_seen_at > NOW() - INTERVAL '5 minutes' AND COALESCE(hide_online,false)=false);
$$;
GRANT EXECUTE ON FUNCTION public.is_user_online(UUID) TO authenticated;

-- ── 6. Updated public.profiles view ──
DROP VIEW IF EXISTS public.profiles CASCADE;
CREATE VIEW public.profiles AS
  SELECT id, username, full_name, gender, birthdate, looking_for, avatar_url,
         hide_online, show_in_radar, followers_count, following_count,
         streams_count, coins_earned, referral_code, streak_days,
         last_login_date, last_seen_at, created_at
  FROM app_private.profiles;
