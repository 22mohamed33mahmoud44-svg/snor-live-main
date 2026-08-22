/*
# Migration 014: Phase 8 — Daily Missions + Profile Boost System
# ===============================================================
#
# 1. Daily Missions System:
#    - public.mission_definitions  — قائمة المهام (daily/weekly/one_time)
#    - public.user_missions        — تتبع تقدم المستخدم
#    - get_my_missions()           — يجيب المهام ويعينها تلقائياً
#    - update_mission_progress()   — يحدث التقدم عند كل action
#    - claim_mission_reward()      — يصرف المكافأة + يشحن العملات
#
# 2. Profile Boost System:
#    - public.profile_boosts       — سجل الـ boosts النشطة
#    - public.boost_packages       — حزم الأسعار (1h/6h/24h)
#    - boost_profile()             — يدفع المستخدم ويحصل على boost
#    - get_boosted_profiles()      — يجيب المستخدمين المُبرزين
#    - expire_profile_boosts()     — ينظف الـ boosts المنتهية (pg_cron كل 10 دقائق)
*/

-- ── 1. mission_definitions ──
CREATE TABLE IF NOT EXISTS public.mission_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT,
  type         TEXT NOT NULL CHECK (type IN ('daily','weekly','one_time')),
  action       TEXT NOT NULL CHECK (action IN (
                 'send_gift','watch_stream','start_stream',
                 'send_message','follow_user','invite_friend','claim_bonus','buy_coins')),
  target_count INTEGER NOT NULL DEFAULT 1,
  reward_coins INTEGER NOT NULL DEFAULT 10,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "missions read all" ON public.mission_definitions;
CREATE POLICY "missions read all" ON public.mission_definitions FOR SELECT TO authenticated USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE ON public.mission_definitions FROM anon, authenticated;

-- ── 2. user_missions ──
CREATE TABLE IF NOT EXISTS public.user_missions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id     UUID NOT NULL REFERENCES public.mission_definitions(id) ON DELETE CASCADE,
  progress       INTEGER NOT NULL DEFAULT 0,
  is_completed   BOOLEAN NOT NULL DEFAULT false,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  assigned_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at   TIMESTAMPTZ,
  claimed_at     TIMESTAMPTZ,
  CONSTRAINT unique_user_mission_day UNIQUE (user_id, mission_id, assigned_on)
);
CREATE INDEX IF NOT EXISTS idx_user_missions_user    ON public.user_missions(user_id, assigned_on DESC);
CREATE INDEX IF NOT EXISTS idx_user_missions_pending ON public.user_missions(user_id, is_completed, reward_claimed);
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_missions read own" ON public.user_missions;
CREATE POLICY "user_missions read own" ON public.user_missions FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.user_missions FROM anon, authenticated;

-- ── 3. Default Missions ──
INSERT INTO public.mission_definitions (code, title, description, type, action, target_count, reward_coins)
VALUES
  ('daily_gift_1',    'أرسل هدية',           'أرسل هدية واحدة لأي مذيع',          'daily',   'send_gift',    1,  15),
  ('daily_gift_3',    'أرسل 3 هدايا',         'أرسل 3 هدايا اليوم',                'daily',   'send_gift',    3,  30),
  ('daily_watch',     'شاهد بث مباشر',        'شاهد بث مباشر لمدة 5 دقائق',        'daily',   'watch_stream', 1,  10),
  ('daily_stream',    'ابدأ بث مباشر',         'ابدأ بثاً مباشراً اليوم',            'daily',   'start_stream', 1,  25),
  ('daily_follow',    'تابع مذيعاً',           'تابع مذيعاً جديداً',                'daily',   'follow_user',  1,  10),
  ('daily_bonus',     'احصل على المكافأة اليومية','احصل على المكافأة اليومية',      'daily',   'claim_bonus',  1,   5),
  ('weekly_gift_10',  'أرسل 10 هدايا',        'أرسل 10 هدايا خلال الأسبوع',        'weekly',  'send_gift',   10, 100),
  ('weekly_stream_5', 'ابدأ 5 بثوث',          'ابدأ 5 بثوث مباشرة هذا الأسبوع',    'weekly',  'start_stream', 5, 150),
  ('onetime_invite',  'ادعو صديقاً',           'ادعو صديقاً للتطبيق',               'one_time','invite_friend',1,  50),
  ('onetime_coins',   'اشتر عملات لأول مرة',  'اشتر حزمة عملات لأول مرة',         'one_time','buy_coins',    1,  75)
ON CONFLICT (code) DO NOTHING;

-- ── 4. get_my_missions() ──
CREATE OR REPLACE FUNCTION public.get_my_missions()
RETURNS TABLE (mission_id UUID, code TEXT, title TEXT, description TEXT, type TEXT, action TEXT,
               target_count INTEGER, reward_coins INTEGER, progress INTEGER, is_completed BOOLEAN, reward_claimed BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO user_missions (user_id, mission_id, assigned_on)
  SELECT v_user_id, md.id, CURRENT_DATE FROM mission_definitions md WHERE md.type='daily' AND md.is_active=true
  ON CONFLICT (user_id, mission_id, assigned_on) DO NOTHING;
  INSERT INTO user_missions (user_id, mission_id, assigned_on)
  SELECT v_user_id, md.id, DATE_TRUNC('week',CURRENT_DATE)::date FROM mission_definitions md WHERE md.type='weekly' AND md.is_active=true
  ON CONFLICT (user_id, mission_id, assigned_on) DO NOTHING;
  INSERT INTO user_missions (user_id, mission_id, assigned_on)
  SELECT v_user_id, md.id, '2000-01-01'::date FROM mission_definitions md WHERE md.type='one_time' AND md.is_active=true
    AND NOT EXISTS (SELECT 1 FROM user_missions um WHERE um.user_id=v_user_id AND um.mission_id=md.id)
  ON CONFLICT (user_id, mission_id, assigned_on) DO NOTHING;
  RETURN QUERY
    SELECT md.id, md.code, md.title, md.description, md.type, md.action,
           md.target_count, md.reward_coins, um.progress, um.is_completed, um.reward_claimed
    FROM user_missions um JOIN mission_definitions md ON md.id=um.mission_id
    WHERE um.user_id=v_user_id AND (
      (md.type='daily' AND um.assigned_on=CURRENT_DATE) OR
      (md.type='weekly' AND um.assigned_on=DATE_TRUNC('week',CURRENT_DATE)::date) OR
      (md.type='one_time' AND NOT um.is_completed))
    ORDER BY um.is_completed ASC, md.reward_coins DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_missions() TO authenticated;

-- ── 5. update_mission_progress() ──
CREATE OR REPLACE FUNCTION public.update_mission_progress(p_action TEXT, p_increment INTEGER DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid(); v_mission RECORD;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  FOR v_mission IN
    SELECT um.id, um.progress, md.target_count FROM user_missions um
    JOIN mission_definitions md ON md.id=um.mission_id
    WHERE um.user_id=v_user_id AND md.action=p_action AND md.is_active=true AND um.is_completed=false
      AND ((md.type='daily' AND um.assigned_on=CURRENT_DATE) OR
           (md.type='weekly' AND um.assigned_on=DATE_TRUNC('week',CURRENT_DATE)::date) OR
           (md.type='one_time'))
  LOOP
    UPDATE user_missions SET
      progress=LEAST(v_mission.progress+p_increment, v_mission.target_count),
      is_completed=(v_mission.progress+p_increment >= v_mission.target_count),
      completed_at=CASE WHEN v_mission.progress+p_increment >= v_mission.target_count THEN NOW() ELSE NULL END
    WHERE id=v_mission.id;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_mission_progress(TEXT, INTEGER) TO authenticated, service_role;

-- ── 6. claim_mission_reward() ──
CREATE OR REPLACE FUNCTION public.claim_mission_reward(p_mission_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid(); v_mission user_missions%ROWTYPE; v_def mission_definitions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_mission FROM user_missions WHERE user_id=v_user_id AND mission_id=p_mission_id AND is_completed=true AND reward_claimed=false LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','mission_not_completed_or_already_claimed'); END IF;
  SELECT * INTO v_def FROM mission_definitions WHERE id=p_mission_id;
  UPDATE user_missions SET reward_claimed=true, claimed_at=NOW() WHERE id=v_mission.id;
  INSERT INTO users_coins (user_id,coins) VALUES (v_user_id,v_def.reward_coins)
    ON CONFLICT (user_id) DO UPDATE SET coins=users_coins.coins+v_def.reward_coins, updated_at=NOW();
  INSERT INTO transactions (user_id,type,amount,meta)
    VALUES (v_user_id,'bonus',v_def.reward_coins,jsonb_build_object('reason','mission_reward','mission_code',v_def.code));
  INSERT INTO notifications (user_id,type,title,data)
    VALUES (v_user_id,'system','🎯 مهمة مكتملة! '||v_def.title, jsonb_build_object('coins_earned',v_def.reward_coins,'mission_code',v_def.code));
  RETURN jsonb_build_object('success',true,'coins_earned',v_def.reward_coins,'mission',v_def.title);
END; $$;
GRANT EXECUTE ON FUNCTION public.claim_mission_reward(UUID) TO authenticated;

-- ── 7. profile_boosts ──
CREATE TABLE IF NOT EXISTS public.profile_boosts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boost_type TEXT NOT NULL CHECK (boost_type IN ('home_page','search_top','radar_top')),
  coins_paid INTEGER NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_profile_boosts_active ON public.profile_boosts(boost_type, expires_at DESC) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_profile_boosts_user   ON public.profile_boosts(user_id, expires_at DESC);
ALTER TABLE public.profile_boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boosts read all" ON public.profile_boosts;
CREATE POLICY "boosts read all" ON public.profile_boosts FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.profile_boosts FROM anon, authenticated;

-- ── 8. boost_packages ──
CREATE TABLE IF NOT EXISTS public.boost_packages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boost_type     TEXT NOT NULL CHECK (boost_type IN ('home_page','search_top','radar_top')),
  duration_hours INTEGER NOT NULL,
  coins_cost     INTEGER NOT NULL,
  label          TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.boost_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boost_packages read all" ON public.boost_packages;
CREATE POLICY "boost_packages read all" ON public.boost_packages FOR SELECT TO authenticated USING (is_active=true);
REVOKE INSERT, UPDATE, DELETE ON public.boost_packages FROM anon, authenticated;

INSERT INTO public.boost_packages (boost_type, duration_hours, coins_cost, label) VALUES
  ('home_page', 1, 50, 'ظهور في الصفحة الرئيسية - ساعة'),('home_page', 6, 200, 'ظهور في الصفحة الرئيسية - 6 ساعات'),
  ('home_page',24, 500,'ظهور في الصفحة الرئيسية - يوم كامل'),('search_top', 1, 30,'أول نتائج البحث - ساعة'),
  ('search_top', 6,120,'أول نتائج البحث - 6 ساعات'),('search_top',24,300,'أول نتائج البحث - يوم كامل'),
  ('radar_top', 1, 20,'أول الرادار - ساعة'),('radar_top', 6, 80,'أول الرادار - 6 ساعات'),
  ('radar_top',24,200,'أول الرادار - يوم كامل')
ON CONFLICT DO NOTHING;

-- ── 9. boost_profile() ──
CREATE OR REPLACE FUNCTION public.boost_profile(p_package_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_package boost_packages%ROWTYPE; v_deduct JSONB; v_expires TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_package FROM boost_packages WHERE id=p_package_id AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','package_not_found'); END IF;
  IF EXISTS (SELECT 1 FROM profile_boosts WHERE user_id=v_user_id AND boost_type=v_package.boost_type AND is_active=true AND expires_at>NOW()) THEN
    RETURN jsonb_build_object('success',false,'error','boost_already_active');
  END IF;
  v_deduct:=deduct_coins(v_user_id,v_package.coins_cost,'profile_boost',
    jsonb_build_object('boost_type',v_package.boost_type,'duration_hours',v_package.duration_hours));
  IF NOT (v_deduct->>'success')::boolean THEN RETURN v_deduct; END IF;
  v_expires:=NOW()+(v_package.duration_hours||' hours')::interval;
  INSERT INTO profile_boosts (user_id,boost_type,coins_paid,expires_at) VALUES (v_user_id,v_package.boost_type,v_package.coins_cost,v_expires);
  RETURN jsonb_build_object('success',true,'boost_type',v_package.boost_type,'expires_at',v_expires,'coins_paid',v_package.coins_cost);
END; $$;
GRANT EXECUTE ON FUNCTION public.boost_profile(UUID) TO authenticated;

-- ── 10. get_boosted_profiles() ──
CREATE OR REPLACE FUNCTION public.get_boosted_profiles(p_boost_type TEXT, p_limit INT DEFAULT 10)
RETURNS TABLE (user_id UUID, username TEXT, avatar_url TEXT, followers_count INTEGER, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT p.id,p.username,p.avatar_url,p.followers_count,pb.expires_at
    FROM profile_boosts pb JOIN app_private.profiles p ON p.id=pb.user_id
    WHERE pb.boost_type=p_boost_type AND pb.is_active=true AND pb.expires_at>NOW()
    ORDER BY pb.expires_at DESC LIMIT p_limit;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_boosted_profiles(TEXT,INT) TO authenticated, anon;

-- ── 11. expire_profile_boosts() ──
CREATE OR REPLACE FUNCTION public.expire_profile_boosts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE profile_boosts SET is_active=false WHERE is_active=true AND expires_at<NOW(); END; $$;
REVOKE EXECUTE ON FUNCTION public.expire_profile_boosts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_profile_boosts() TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('expire-profile-boosts','*/10 * * * *','SELECT public.expire_profile_boosts()');
  END IF;
END; $$;
