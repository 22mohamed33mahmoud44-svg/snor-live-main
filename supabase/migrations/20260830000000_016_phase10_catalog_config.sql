/*
# Migration 016: Phase 10 — Gift Types Catalog + Coin Packages + App Config + Device Tokens
# ===========================================================================================
#
# 1. public.gift_types       — كتالوج الهدايا الديناميكي (12 هدية + أسعار مرنة)
# 2. public.coin_packages    — حزم شراء العملات (7 حزم بمكافآت)
# 3. public.app_config       — إعدادات التطبيق الديناميكية (13 إعداد)
# 4. public.device_tokens    — توكنات الأجهزة لـ Push Notifications
# 5. get_app_config()        — يجيب كل الإعدادات كـ JSONB
# 6. update_app_config()     — service_role يعدل الإعدادات
# 7. register_device_token() — يسجل/يحدث توكن الجهاز
# 8. deactivate_device_token() — يعطل التوكن عند تسجيل الخروج
# 9. get_gift_cost()         — يجيب سعر الهدية من الكتالوج
*/

-- ── 1. gift_types ──
CREATE TABLE IF NOT EXISTS public.gift_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '🎁',
  coin_cost     INTEGER NOT NULL CHECK (coin_cost > 0),
  coins_earned  INTEGER NOT NULL GENERATED ALWAYS AS (FLOOR(coin_cost * 0.70)::integer) STORED,
  animation_url TEXT,
  image_url     TEXT,
  category      TEXT NOT NULL DEFAULT 'basic'
                CHECK (category IN ('basic','premium','exclusive','seasonal')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.gift_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gift_types read all" ON public.gift_types;
CREATE POLICY "gift_types read all" ON public.gift_types FOR SELECT TO authenticated, anon USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE ON public.gift_types FROM anon, authenticated;

INSERT INTO public.gift_types (code, name, name_ar, emoji, coin_cost, category, sort_order) VALUES
  ('rose',     'Rose',       'وردة',    '🌹',  10,    'basic',     1),
  ('heart',    'Heart',      'قلب',     '💛',  25,    'basic',     2),
  ('kiss',     'Kiss',       'قبلة',    '💋',  50,    'basic',     3),
  ('teddy',    'Teddy Bear', 'دب كيوت', '🧸',  80,    'basic',     4),
  ('diamond',  'Diamond',    'ماسة',    '💎',  100,   'premium',   5),
  ('crown',    'Crown',      'تاج',     '👑',  250,   'premium',   6),
  ('rocket',   'Rocket',     'صاروخ',   '🚀',  300,   'premium',   7),
  ('car',      'Car',        'سيارة',   '🚗',  500,   'premium',   8),
  ('yacht',    'Yacht',      'يخت',     '⛵',  1000,  'exclusive', 9),
  ('castle',   'Castle',     'قصر',     '🏰',  2000,  'exclusive', 10),
  ('galaxy',   'Galaxy',     'مجرة',    '🌌',  5000,  'exclusive', 11),
  ('universe', 'Universe',   'كون',     '🪐',  10000, 'exclusive', 12)
ON CONFLICT (code) DO UPDATE SET
  coin_cost = EXCLUDED.coin_cost, name_ar = EXCLUDED.name_ar, sort_order = EXCLUDED.sort_order;

-- ── 2. coin_packages ──
CREATE TABLE IF NOT EXISTS public.coin_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coins       INTEGER NOT NULL CHECK (coins > 0),
  usd_price   NUMERIC(10,2) NOT NULL CHECK (usd_price > 0),
  bonus_coins INTEGER NOT NULL DEFAULT 0,
  total_coins INTEGER NOT NULL GENERATED ALWAYS AS (coins + bonus_coins) STORED,
  label       TEXT NOT NULL,
  badge       TEXT,
  is_popular  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_packages read all" ON public.coin_packages;
CREATE POLICY "coin_packages read all" ON public.coin_packages FOR SELECT TO authenticated, anon USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE ON public.coin_packages FROM anon, authenticated;

INSERT INTO public.coin_packages (coins, usd_price, bonus_coins, label, badge, is_popular, sort_order) VALUES
  (100,   0.99,  0,    '100 عملة',           NULL,               false, 1),
  (500,   3.99,  50,   '500 + 50 مجاناً',    NULL,               false, 2),
  (1000,  6.99,  150,  '1000 + 150 مجاناً',  NULL,               true,  3),
  (2500,  14.99, 500,  '2500 + 500 مجاناً',  '🔥 الأكثر مبيعاً', true,  4),
  (5000,  24.99, 1500, '5000 + 1500 مجاناً', '💎 قيمة ممتازة',   false, 5),
  (10000, 44.99, 4000, '10K + 4000 مجاناً',  '👑 الأفضل',        false, 6),
  (25000, 99.99, 12500,'25K + 12.5K مجاناً', '🏆 VIP',            false, 7)
ON CONFLICT DO NOTHING;

-- ── 3. app_config ──
CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_config read all" ON public.app_config;
CREATE POLICY "app_config read all" ON public.app_config FOR SELECT TO authenticated, anon USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.app_config FROM anon, authenticated;

INSERT INTO public.app_config (key, value, description) VALUES
  ('daily_bonus_base_coins',    '10',     'العملات الأساسية للمكافأة اليومية'),
  ('max_chat_messages_per_min', '10',     'الحد الأقصى لرسائل الشات في الدقيقة'),
  ('min_withdrawal_coins',      '1000',   'الحد الأدنى للسحب بالعملات'),
  ('coin_to_usd_rate',          '0.007',  'معدل تحويل العملة للدولار'),
  ('referral_reward_coins',     '50',     'مكافأة الإحالة للمُحيل'),
  ('referral_welcome_coins',    '20',     'مكافأة الترحيب للمُحال'),
  ('stream_heartbeat_interval', '20',     'مدة heartbeat البث بالثواني'),
  ('stream_dead_timeout_secs',  '60',     'مدة انتهاء البث بدون heartbeat'),
  ('max_stream_duration_hours', '12',     'الحد الأقصى لمدة البث بالساعات'),
  ('gift_streamer_earn_rate',   '0.70',   'نسبة ما يكسبه المذيع من الهدية'),
  ('maintenance_mode',          'false',  'وضع الصيانة'),
  ('min_app_version',           '"1.0.0"','الحد الأدنى لإصدار التطبيق'),
  ('feature_flags', '{"paid_shows":true,"missions":true,"boosts":true,"vip":true,"agents":true}', 'تفعيل/تعطيل الميزات')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_app_config()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(key, value) INTO v_result FROM app_config;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_app_config() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.update_app_config(p_key TEXT, p_value JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO app_config (key, value, updated_at) VALUES (p_key, p_value, NOW())
  ON CONFLICT (key) DO UPDATE SET value=p_value, updated_at=NOW();
  RETURN jsonb_build_object('success',true,'key',p_key,'value',p_value);
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_app_config(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_app_config(TEXT, JSONB) TO service_role;

-- ── 4. device_tokens ──
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_device_token UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user     ON public.device_tokens(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON public.device_tokens(platform, is_active);
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "device_tokens read own"   ON public.device_tokens;
CREATE POLICY "device_tokens read own"   ON public.device_tokens FOR SELECT TO authenticated USING (auth.uid()=user_id);
DROP POLICY IF EXISTS "device_tokens insert own" ON public.device_tokens;
CREATE POLICY "device_tokens insert own" ON public.device_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
DROP POLICY IF EXISTS "device_tokens update own" ON public.device_tokens;
CREATE POLICY "device_tokens update own" ON public.device_tokens FOR UPDATE TO authenticated USING (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.register_device_token(p_token TEXT, p_platform TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO device_tokens (user_id, token, platform, last_used_at) VALUES (v_user_id, p_token, p_platform, NOW())
  ON CONFLICT (token) DO UPDATE SET user_id=v_user_id, is_active=true, last_used_at=NOW();
  RETURN jsonb_build_object('success',true,'platform',p_platform);
END; $$;
GRANT EXECUTE ON FUNCTION public.register_device_token(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_device_token(p_token TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE device_tokens SET is_active=false WHERE token=p_token AND user_id=auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.deactivate_device_token(TEXT) TO authenticated;

-- ── 5. get_gift_cost() ──
CREATE OR REPLACE FUNCTION public.get_gift_cost(p_gift_type TEXT)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cost INTEGER;
BEGIN
  SELECT coin_cost INTO v_cost FROM gift_types WHERE code=p_gift_type AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift type not found: %', p_gift_type; END IF;
  RETURN v_cost;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_gift_cost(TEXT) TO authenticated, service_role;
