/*
# Migration 015: Phase 9 — VIP System + Agent System + Streamer Analytics
# ========================================================================
#
# 1. VIP System:
#    - public.vip_features       — مزايا كل tier (silver/gold/diamond)
#    - public.vip_pricing        — أسعار الاشتراك (30/90/365 يوم)
#    - subscribe_vip()           — اشتراك VIP بالعملات مع دعم التجديد
#    - get_my_vip()              — بيانات VIP الحالي + المزايا
#    - distribute_vip_daily_coins() — توزيع عملات يومية (pg_cron منتصف الليل)
#
# 2. Agent/Affiliate System:
#    - public.agents             — الوكلاء (كود + نسبة عمولة)
#    - public.agent_referrals    — المذيعون المسجلون عبر الوكيل
#    - public.agent_commissions  — سجل العمولات التلقائية
#    - register_as_agent()       — تسجيل كوكيل
#    - join_via_agent()          — مذيع يسجل عبر كود الوكيل
#    - get_agent_dashboard()     — لوحة بيانات الوكيل
#
# 3. Streamer Analytics:
#    - public.streamer_stats     — إحصائيات يومية للمذيع
#    - get_streamer_analytics()  — لوحة تحليلات شاملة (30 يوم)
*/

-- ── 1. vip_features ──
CREATE TABLE IF NOT EXISTS public.vip_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier          TEXT NOT NULL CHECK (tier IN ('silver','gold','diamond')),
  feature_key   TEXT NOT NULL,
  feature_label TEXT NOT NULL,
  feature_value TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_tier_feature UNIQUE (tier, feature_key)
);
ALTER TABLE public.vip_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vip_features read all" ON public.vip_features;
CREATE POLICY "vip_features read all" ON public.vip_features FOR SELECT TO authenticated, anon USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.vip_features FROM anon, authenticated;

INSERT INTO public.vip_features (tier, feature_key, feature_label, feature_value) VALUES
  ('silver','badge','شارة VIP فضية','silver_badge'),
  ('silver','daily_coins','عملات يومية مجانية','20'),
  ('silver','chat_priority','أولوية في الشات','true'),
  ('silver','private_msg_limit','رسائل خاصة يومياً','50'),
  ('silver','gift_discount','خصم على الهدايا','5%'),
  ('gold','badge','شارة VIP ذهبية','gold_badge'),
  ('gold','daily_coins','عملات يومية مجانية','50'),
  ('gold','chat_priority','أولوية في الشات','true'),
  ('gold','private_msg_limit','رسائل خاصة يومياً','200'),
  ('gold','gift_discount','خصم على الهدايا','10%'),
  ('gold','search_boost','ظهور في أعلى البحث','true'),
  ('gold','profile_frame','إطار ذهبي للصورة','gold_frame'),
  ('diamond','badge','شارة VIP ماسية','diamond_badge'),
  ('diamond','daily_coins','عملات يومية مجانية','100'),
  ('diamond','chat_priority','أولوية في الشات','true'),
  ('diamond','private_msg_limit','رسائل خاصة يومياً','unlimited'),
  ('diamond','gift_discount','خصم على الهدايا','20%'),
  ('diamond','search_boost','ظهور في أعلى البحث','true'),
  ('diamond','profile_frame','إطار ماسي للصورة','diamond_frame'),
  ('diamond','home_page_boost','ظهور في الصفحة الرئيسية','true'),
  ('diamond','exclusive_gifts','هدايا حصرية','true'),
  ('diamond','paid_show_discount','خصم على البثوث الخاصة','25%')
ON CONFLICT (tier, feature_key) DO NOTHING;

-- ── 2. vip_pricing ──
CREATE TABLE IF NOT EXISTS public.vip_pricing (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier          TEXT NOT NULL CHECK (tier IN ('silver','gold','diamond')),
  duration_days INTEGER NOT NULL CHECK (duration_days IN (30,90,365)),
  coins_cost    INTEGER NOT NULL,
  usd_price     NUMERIC(10,2),
  label         TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT unique_tier_duration UNIQUE (tier, duration_days)
);
ALTER TABLE public.vip_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vip_pricing read all" ON public.vip_pricing;
CREATE POLICY "vip_pricing read all" ON public.vip_pricing FOR SELECT TO authenticated, anon USING (is_active=true);
REVOKE INSERT, UPDATE, DELETE ON public.vip_pricing FROM anon, authenticated;

INSERT INTO public.vip_pricing (tier, duration_days, coins_cost, usd_price, label) VALUES
  ('silver', 30,   500,  4.99,'Silver شهري'),('silver', 90,  1200,  9.99,'Silver 3 أشهر'),('silver',365,  4000, 29.99,'Silver سنوي'),
  ('gold',   30,  1200,  9.99,'Gold شهري'),  ('gold',   90,  3000, 24.99,'Gold 3 أشهر'),  ('gold',  365,  9000, 79.99,'Gold سنوي'),
  ('diamond',30,  2500, 19.99,'Diamond شهري'),('diamond',90, 6500, 49.99,'Diamond 3 أشهر'),('diamond',365,20000,159.99,'Diamond سنوي')
ON CONFLICT (tier, duration_days) DO NOTHING;

-- ── 3. subscribe_vip() ──
CREATE OR REPLACE FUNCTION public.subscribe_vip(p_pricing_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_pricing vip_pricing%ROWTYPE; v_deduct JSONB; v_expires_at TIMESTAMPTZ; v_existing vip_subscriptions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_pricing FROM vip_pricing WHERE id=p_pricing_id AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','pricing_not_found'); END IF;
  SELECT * INTO v_existing FROM vip_subscriptions WHERE user_id=v_user_id AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL AND v_existing.tier=v_pricing.tier THEN
    v_expires_at:=v_existing.expires_at+(v_pricing.duration_days||' days')::interval;
  ELSE v_expires_at:=NOW()+(v_pricing.duration_days||' days')::interval; END IF;
  v_deduct:=deduct_coins(v_user_id,v_pricing.coins_cost,'vip_subscription',
    jsonb_build_object('tier',v_pricing.tier,'duration_days',v_pricing.duration_days));
  IF NOT (v_deduct->>'success')::boolean THEN RETURN v_deduct; END IF;
  INSERT INTO vip_subscriptions (user_id,tier,expires_at) VALUES (v_user_id,v_pricing.tier,v_expires_at);
  INSERT INTO notifications (user_id,type,title,data) VALUES (v_user_id,'system',
    '⭐ مرحباً بك في VIP '||v_pricing.tier||'!',
    jsonb_build_object('tier',v_pricing.tier,'expires_at',v_expires_at,'coins_paid',v_pricing.coins_cost));
  RETURN jsonb_build_object('success',true,'tier',v_pricing.tier,'expires_at',v_expires_at,'coins_paid',v_pricing.coins_cost);
END; $$;
GRANT EXECUTE ON FUNCTION public.subscribe_vip(UUID) TO authenticated;

-- ── 4. get_my_vip() ──
CREATE OR REPLACE FUNCTION public.get_my_vip()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_sub vip_subscriptions%ROWTYPE; v_features JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_sub FROM vip_subscriptions WHERE user_id=v_user_id AND expires_at>NOW()
    ORDER BY CASE tier WHEN 'diamond' THEN 3 WHEN 'gold' THEN 2 ELSE 1 END DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('has_vip',false); END IF;
  SELECT jsonb_agg(jsonb_build_object('feature_key',feature_key,'feature_label',feature_label,'feature_value',feature_value))
    INTO v_features FROM vip_features WHERE tier=v_sub.tier;
  RETURN jsonb_build_object('has_vip',true,'tier',v_sub.tier,'expires_at',v_sub.expires_at,
    'days_remaining',EXTRACT(DAY FROM v_sub.expires_at-NOW())::INTEGER,'features',v_features);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_vip() TO authenticated;

-- ── 5. distribute_vip_daily_coins() ──
CREATE OR REPLACE FUNCTION public.distribute_vip_daily_coins()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec RECORD; v_coins INTEGER;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ON (vs.user_id) vs.user_id, vs.tier FROM vip_subscriptions vs
    WHERE vs.expires_at>NOW() ORDER BY vs.user_id, CASE vs.tier WHEN 'diamond' THEN 3 WHEN 'gold' THEN 2 ELSE 1 END DESC
  LOOP
    v_coins:=CASE v_rec.tier WHEN 'diamond' THEN 100 WHEN 'gold' THEN 50 ELSE 20 END;
    INSERT INTO users_coins (user_id,coins) VALUES (v_rec.user_id,v_coins)
      ON CONFLICT (user_id) DO UPDATE SET coins=users_coins.coins+v_coins, updated_at=NOW();
    INSERT INTO transactions (user_id,type,amount,meta)
      VALUES (v_rec.user_id,'bonus',v_coins,jsonb_build_object('reason','vip_daily_coins','tier',v_rec.tier));
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.distribute_vip_daily_coins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_vip_daily_coins() TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('distribute-vip-daily-coins','0 0 * * *','SELECT public.distribute_vip_daily_coins()');
  END IF;
END; $$;

-- ── 6. agents ──
CREATE TABLE IF NOT EXISTS public.agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_code      TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text),1,10),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_rate BETWEEN 0 AND 50),
  total_earnings  INTEGER NOT NULL DEFAULT 0,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_agent_user UNIQUE (user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_code ON public.agents(agent_code);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agents read own" ON public.agents;
CREATE POLICY "agents read own" ON public.agents FOR SELECT TO authenticated USING (auth.uid()=user_id);
REVOKE INSERT, UPDATE, DELETE ON public.agents FROM anon, authenticated;

-- ── 7. agent_referrals ──
CREATE TABLE IF NOT EXISTS public.agent_referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  total_earned INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT unique_agent_streamer UNIQUE (agent_id, streamer_id)
);
ALTER TABLE public.agent_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_referrals read own" ON public.agent_referrals;
CREATE POLICY "agent_referrals read own" ON public.agent_referrals FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM agents WHERE user_id=auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.agent_referrals FROM anon, authenticated;

-- ── 8. agent_commissions ──
CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  streamer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type      TEXT NOT NULL CHECK (source_type IN ('gift','vip','paid_show','coins_purchase')),
  source_amount    INTEGER NOT NULL,
  commission_coins INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent ON public.agent_commissions(agent_id, created_at DESC);
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_commissions read own" ON public.agent_commissions;
CREATE POLICY "agent_commissions read own" ON public.agent_commissions FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM agents WHERE user_id=auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.agent_commissions FROM anon, authenticated;

-- ── 9. register_as_agent() ──
CREATE OR REPLACE FUNCTION public.register_as_agent()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_agent_id UUID; v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF EXISTS (SELECT 1 FROM agents WHERE user_id=v_user_id) THEN
    RETURN jsonb_build_object('success',false,'error','already_an_agent');
  END IF;
  v_code:=upper(substr(md5(v_user_id::text||random()::text),1,8));
  INSERT INTO agents (user_id,agent_code) VALUES (v_user_id,v_code) RETURNING id INTO v_agent_id;
  RETURN jsonb_build_object('success',true,'agent_code',v_code,'agent_id',v_agent_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.register_as_agent() TO authenticated;

-- ── 10. join_via_agent() ──
CREATE OR REPLACE FUNCTION public.join_via_agent(p_agent_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_agent agents%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_agent FROM agents WHERE agent_code=upper(p_agent_code) AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','invalid_agent_code'); END IF;
  IF v_agent.user_id=v_user_id THEN RETURN jsonb_build_object('success',false,'error','cannot_join_own_agent'); END IF;
  IF EXISTS (SELECT 1 FROM agent_referrals WHERE streamer_id=v_user_id) THEN
    RETURN jsonb_build_object('success',false,'error','already_under_agent');
  END IF;
  INSERT INTO agent_referrals (agent_id,streamer_id) VALUES (v_agent.id,v_user_id);
  UPDATE agents SET total_referrals=total_referrals+1 WHERE id=v_agent.id;
  INSERT INTO notifications (user_id,type,title,data)
    VALUES (v_agent.user_id,'system','🤝 مذيع جديد انضم عبر كودك!',jsonb_build_object('streamer_id',v_user_id));
  RETURN jsonb_build_object('success',true,'agent_id',v_agent.id);
END; $$;
GRANT EXECUTE ON FUNCTION public.join_via_agent(TEXT) TO authenticated;

-- ── 11. get_agent_dashboard() ──
CREATE OR REPLACE FUNCTION public.get_agent_dashboard()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_agent agents%ROWTYPE; v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_agent FROM agents WHERE user_id=v_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('is_agent',false); END IF;
  SELECT jsonb_build_object('is_agent',true,'agent_code',v_agent.agent_code,'commission_rate',v_agent.commission_rate,
    'total_earnings',v_agent.total_earnings,'total_referrals',v_agent.total_referrals,
    'coin_balance',(SELECT COALESCE(coins,0) FROM users_coins WHERE user_id=v_user_id),
    'this_month_commissions',(SELECT COALESCE(SUM(commission_coins),0) FROM agent_commissions
      WHERE agent_id=v_agent.id AND created_at>=DATE_TRUNC('month',NOW())),
    'streamers',(SELECT jsonb_agg(jsonb_build_object('streamer_id',ar.streamer_id,'username',p.username,
      'avatar_url',p.avatar_url,'joined_at',ar.joined_at,'total_earned',ar.total_earned))
      FROM agent_referrals ar LEFT JOIN app_private.profiles p ON p.id=ar.streamer_id WHERE ar.agent_id=v_agent.id))
  INTO v_result;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_dashboard() TO authenticated;

-- ── 12. streamer_stats ──
CREATE TABLE IF NOT EXISTS public.streamer_stats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stat_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  total_viewers  INTEGER NOT NULL DEFAULT 0,
  peak_viewers   INTEGER NOT NULL DEFAULT 0,
  total_streams  INTEGER NOT NULL DEFAULT 0,
  stream_minutes INTEGER NOT NULL DEFAULT 0,
  gifts_received INTEGER NOT NULL DEFAULT 0,
  coins_earned   INTEGER NOT NULL DEFAULT 0,
  new_followers  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT unique_streamer_stat_day UNIQUE (streamer_id, stat_date)
);
CREATE INDEX IF NOT EXISTS idx_streamer_stats_date ON public.streamer_stats(streamer_id, stat_date DESC);
ALTER TABLE public.streamer_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "streamer_stats read own" ON public.streamer_stats;
CREATE POLICY "streamer_stats read own" ON public.streamer_stats FOR SELECT TO authenticated USING (auth.uid()=streamer_id);
REVOKE INSERT, UPDATE, DELETE ON public.streamer_stats FROM anon, authenticated;

-- ── 13. get_streamer_analytics() ──
CREATE OR REPLACE FUNCTION public.get_streamer_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID:=auth.uid(); v_from DATE:=CURRENT_DATE-p_days; v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT jsonb_build_object('period_days',p_days,
    'summary',jsonb_build_object('total_streams',COUNT(DISTINCT ls.id),
      'total_gifts',COALESCE(SUM(gl.coin_cost),0),
      'total_followers',(SELECT followers_count FROM app_private.profiles WHERE id=v_user_id),
      'coin_balance',(SELECT COALESCE(coins,0) FROM users_coins WHERE user_id=v_user_id)),
    'top_gifters',(SELECT jsonb_agg(jsonb_build_object('user_id',gl2.sender_id,'username',p2.username,
      'avatar_url',p2.avatar_url,'total_coins',SUM(gl2.coin_cost)))
      FROM gift_logs gl2 LEFT JOIN app_private.profiles p2 ON p2.id=gl2.sender_id
      WHERE gl2.receiver_id=v_user_id AND gl2.created_at>=v_from
      GROUP BY gl2.sender_id,p2.username,p2.avatar_url ORDER BY SUM(gl2.coin_cost) DESC LIMIT 10),
    'daily_stats',(SELECT jsonb_agg(jsonb_build_object('date',ss.stat_date,'coins_earned',ss.coins_earned,
      'gifts_received',ss.gifts_received,'new_followers',ss.new_followers,'stream_minutes',ss.stream_minutes)
      ORDER BY ss.stat_date)
      FROM streamer_stats ss WHERE ss.streamer_id=v_user_id AND ss.stat_date>=v_from))
  INTO v_result FROM live_streams ls LEFT JOIN gift_logs gl ON gl.stream_id=ls.id
  WHERE ls.user_id=v_user_id AND ls.created_at::date>=v_from;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_streamer_analytics(INTEGER) TO authenticated;
