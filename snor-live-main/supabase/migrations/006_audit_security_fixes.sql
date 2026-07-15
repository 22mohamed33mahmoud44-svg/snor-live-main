-- ════════════════════════════════════════════════════════════════════
-- 006_audit_security_fixes.sql
-- Consolidated fixes from the security audit. Idempotent: safe to re-run.
--
--   C2: coin RPCs callable with arbitrary user ids  → coin minting/draining
--   C3: missing RLS on stripe_events / daily_bonus_claims
--   C4: schema hardening + missing indexes
--   C5: missing UPDATE policies (matches, withdrawals, profiles)
--   H2: stale matchmaking data never cleaned up (no scheduler)
--   H4: profiles publicly readable including birthdate (privacy leak)
--   H5: SECURITY DEFINER functions without a pinned search_path
-- ════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- C2 + H5 ─ Lock down every coin RPC and pin search_path
-- ══════════════════════════════════════════════════════════════

-- ── handle_new_user: pin search_path, make idempotent ──────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO users_coins (user_id, coins)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── add_coins: SERVER-ONLY (payment webhooks). Never callable
--    by browser clients. Validates amount to prevent negative
--    "additions" being used to drain balances. ──────────────────
CREATE OR REPLACE FUNCTION add_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'add_coins: amount must be positive';
  END IF;

  INSERT INTO users_coins (user_id, coins)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = users_coins.coins + p_amount, updated_at = NOW();

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'buy', p_amount, COALESCE(p_meta, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) TO service_role;

-- ── deduct_coins: caller must be the wallet owner. Positive
--    amounts only (a negative p_amount previously MINTED coins). ─
CREATE OR REPLACE FUNCTION deduct_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_reason  TEXT,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
BEGIN
  -- auth.uid() IS NULL only for service_role (anon EXECUTE is revoked below)
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  SELECT coins INTO v_current
  FROM users_coins
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins', 'balance', v_current);
  END IF;

  UPDATE users_coins
  SET coins = coins - p_amount, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'spend', -p_amount,
          COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) FROM anon;
GRANT  EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) TO authenticated;
GRANT  EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) TO service_role;

-- ── send_gift: caller must be the sender. Validates cost, blocks
--    self-gifting, and UPSERTS the receiver wallet (previously the
--    receiver UPDATE silently affected 0 rows if they had no
--    users_coins row → sender charged, coins vanished). ──────────
CREATE OR REPLACE FUNCTION send_gift(
  p_sender_id   UUID,
  p_receiver_id UUID,
  p_gift_type   TEXT,
  p_coins_cost  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earned     INTEGER;
  v_gift_id    UUID;
  v_deduct_res JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_coins_cost IS NULL OR p_coins_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_cost');
  END IF;

  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_gift_not_allowed');
  END IF;

  v_earned := FLOOR(p_coins_cost * 0.70);

  v_deduct_res := deduct_coins(
    p_sender_id, p_coins_cost, 'gift',
    jsonb_build_object('gift_type', p_gift_type, 'to', p_receiver_id)
  );

  IF NOT (v_deduct_res->>'success')::boolean THEN
    RETURN v_deduct_res;
  END IF;

  INSERT INTO users_coins (user_id, coins)
  VALUES (p_receiver_id, v_earned)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = users_coins.coins + v_earned, updated_at = NOW();

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned,
    jsonb_build_object('gift_type', p_gift_type, 'from', p_sender_id));

  INSERT INTO gifts (sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, p_coins_cost, v_earned)
  RETURNING id INTO v_gift_id;

  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;

REVOKE EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT  EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) TO service_role;

-- ── claim_daily_bonus: caller must be the claiming user ─────────
CREATE OR REPLACE FUNCTION claim_daily_bonus(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus INTEGER := 10;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO daily_bonus_claims (user_id, claimed_on)
  VALUES (p_user_id, CURRENT_DATE);

  INSERT INTO users_coins (user_id, coins)
  VALUES (p_user_id, v_bonus)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = users_coins.coins + v_bonus, updated_at = NOW();

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'bonus', v_bonus, '{"reason":"daily_login"}');

  RETURN jsonb_build_object('success', true, 'bonus', v_bonus);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_claimed_today');
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_daily_bonus(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_daily_bonus(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION claim_daily_bonus(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION claim_daily_bonus(UUID) TO service_role;

-- Defense-in-depth: wallets/ledger/gifts are ONLY written through
-- the SECURITY DEFINER RPCs above — never directly by clients.
REVOKE INSERT, UPDATE, DELETE ON users_coins  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON gifts        FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- C3 ─ Enable RLS on the tables that were missing it
-- ══════════════════════════════════════════════════════════════

-- stripe_events: webhook idempotency ledger. Server-only.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stripe_events no client access" ON stripe_events;
CREATE POLICY "stripe_events no client access" ON stripe_events
  FOR ALL USING (false) WITH CHECK (false);

-- daily_bonus_claims: users may see their own claim history;
-- all writes happen inside claim_daily_bonus (SECURITY DEFINER).
ALTER TABLE daily_bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_bonus read own" ON daily_bonus_claims;
CREATE POLICY "daily_bonus read own" ON daily_bonus_claims
  FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON daily_bonus_claims FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- C4 ─ Schema additions & missing indexes
-- ══════════════════════════════════════════════════════════════

-- Columns referenced by the app but never added in a tracked
-- migration (needed by the public_profiles view below).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Hot-path indexes that were missing:
CREATE INDEX IF NOT EXISTS idx_gifts_sender        ON gifts (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user    ON withdrawals (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_pending ON withdrawals (status, requested_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_vip_user            ON vip_subscriptions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_active      ON matches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waiting_created     ON waiting_users (created_at);


-- ══════════════════════════════════════════════════════════════
-- C5 ─ Missing UPDATE policies
-- ══════════════════════════════════════════════════════════════

-- matches: participants must be able to end a call.
-- (VideoCall.tsx `update({status:'ended'})` previously FAILED
--  SILENTLY because no UPDATE policy existed.)
-- Column-level grant ensures clients can ONLY touch `status` —
-- never reassign user1/user2.
DROP POLICY IF EXISTS "matches update participant" ON matches;
CREATE POLICY "matches update participant" ON matches
  FOR UPDATE
  USING (auth.uid() = user1 OR auth.uid() = user2)
  WITH CHECK (
    (auth.uid() = user1 OR auth.uid() = user2)
    AND status IN ('active', 'ended')
  );
REVOKE UPDATE ON matches FROM anon, authenticated;
GRANT UPDATE (status) ON matches TO authenticated;

-- withdrawals: users may only INSERT with status 'pending';
-- status transitions are admin/service-only (no client UPDATE
-- policy on purpose — deny by default + explicit revoke).
DROP POLICY IF EXISTS "insert own withdrawal" ON withdrawals;
CREATE POLICY "insert own withdrawal" ON withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');
REVOKE UPDATE, DELETE ON withdrawals FROM anon, authenticated;

-- profiles: make the UPDATE policy explicit about WITH CHECK so a
-- user can never move their row to another id.
DROP POLICY IF EXISTS "profiles update own" ON profiles;
CREATE POLICY "profiles update own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ══════════════════════════════════════════════════════════════
-- H4 ─ Profile privacy: stop exposing birthdate & settings
-- ══════════════════════════════════════════════════════════════

-- 002 added `USING (true)` — every authed user could read every
-- profile row INCLUDING birthdate, looking_for and settings.
DROP POLICY IF EXISTS "profiles read public" ON profiles;
DROP POLICY IF EXISTS "profiles read own"    ON profiles;
CREATE POLICY "profiles read own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- نحدد الـ View الآمن بدون عمود created_at لتفادي الأخطاء
DROP VIEW IF EXISTS public_profiles CASCADE;
CREATE OR REPLACE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, gender
  FROM profiles;

REVOKE ALL   ON public_profiles FROM PUBLIC;
REVOKE ALL   ON public_profiles FROM anon;
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO service_role;

-- NOTE: frontend reads of OTHER users' profiles must go through
-- `public_profiles` (Dashboard.tsx partner lookup updated to match).


-- ══════════════════════════════════════════════════════════════
-- H2 + H5 ─ Matchmaking cleanup: pinned search_path + scheduling
-- ══════════════════════════════════════════════════════════════

-- Re-create with pinned search_path (H5) — was missing in 002.
CREATE OR REPLACE FUNCTION cleanup_waiting_users()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM waiting_users
  WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- Full cleanup: expired queue entries, zombie 'active' matches,
-- and old signaling rows (WebRTC/end signals are ephemeral).
CREATE OR REPLACE FUNCTION cleanup_matchmaking()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM waiting_users
  WHERE created_at < NOW() - INTERVAL '5 minutes';

  UPDATE matches
  SET status = 'ended'
  WHERE status = 'active'
  AND created_at < NOW() - INTERVAL '2 hours';

  DELETE FROM signals
  WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$;

-- Server-only: never callable from browsers.
REVOKE EXECUTE ON FUNCTION cleanup_waiting_users() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_matchmaking()  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION cleanup_matchmaking()  TO service_role;

-- Schedule via pg_cron when available (Supabase: Database →
-- Extensions → enable pg_cron, then re-run this block or the
-- whole migration — it is idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- cron.schedule with an existing job name replaces the job.
    PERFORM cron.schedule(
      'cleanup-matchmaking',
      '* * * * *',
      'SELECT public.cleanup_matchmaking()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — enable it and re-run to schedule cleanup_matchmaking()';
  END IF;
END;
$$;