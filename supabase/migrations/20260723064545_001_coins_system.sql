/*
# Coins System — Base Tables and RPCs

Creates the coin economy: wallets, transaction ledger, gifts, withdrawals,
VIP subscriptions, Stripe event idempotency, and daily bonus tracking.
Includes SECURITY DEFINER RPCs for all coin operations and a trigger
to auto-create a wallet (with 10 starting coins) on signup.

## New Tables
1. `users_coins` — wallet per user (PK = auth.users.id), balance with CHECK >= 0
2. `transactions` — ledger of all coin movements (buy/spend/earn/bonus/refund)
3. `gifts` — gift records (sender → receiver with coin cost & earned amount)
4. `withdrawals` — user withdrawal requests (PayPal/bank/crypto)
5. `vip_subscriptions` — VIP tier subscriptions (silver/gold/diamond)
6. `stripe_events` — Stripe webhook idempotency ledger
7. `daily_bonus_claims` — tracks daily bonus claim per user per day

## RPCs
- `handle_new_user()` — trigger: auto-create wallet on signup
- `add_coins(p_user_id, p_amount, p_meta)` — add coins (server-only)
- `deduct_coins(p_user_id, p_amount, p_reason, p_meta)` — deduct with balance check
- `send_gift(p_sender_id, p_receiver_id, p_gift_type, p_coins_cost)` — atomic gift transfer
- `claim_daily_bonus(p_user_id)` — claim once per day

## Security
- RLS enabled on all tables
- SELECT-only policies for users on their own data
- INSERT allowed on withdrawals (own only)
- Coin RPCs are SECURITY DEFINER with pinned search_path
*/

-- USERS COINS
CREATE TABLE IF NOT EXISTS users_coins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins      INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('buy','spend','earn','bonus','refund','purchase')),
  amount     INTEGER NOT NULL,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);

-- GIFTS
CREATE TABLE IF NOT EXISTS gifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES auth.users(id),
  receiver_id  UUID NOT NULL REFERENCES auth.users(id),
  gift_type    TEXT NOT NULL,
  coins_cost   INTEGER NOT NULL,
  coins_earned INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_gift CHECK (sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_gifts_receiver ON gifts(receiver_id, created_at DESC);

-- WITHDRAWALS
CREATE TABLE IF NOT EXISTS withdrawals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  coins        INTEGER NOT NULL CHECK (coins >= 1000),
  usd_amount   NUMERIC(10,2) GENERATED ALWAYS AS (coins::numeric * 0.007) STORED,
  method       TEXT NOT NULL CHECK (method IN ('paypal','bank','crypto')),
  account_info JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','paid','rejected')),
  admin_note   TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- VIP SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  tier          TEXT NOT NULL CHECK (tier IN ('silver','gold','diamond')),
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  stripe_sub_id TEXT
);

-- STRIPE EVENTS (idempotency)
CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY BONUS
CREATE TABLE IF NOT EXISTS daily_bonus_claims (
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  claimed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, claimed_on)
);

-- AUTO CREATE COINS ROW ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO users_coins (user_id, coins)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ADD COINS FUNCTION (server-only via service_role)
CREATE OR REPLACE FUNCTION add_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_coins(UUID, INTEGER, JSONB) TO service_role;

-- DEDUCT COINS FUNCTION
CREATE OR REPLACE FUNCTION deduct_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_reason  TEXT,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;
  SELECT coins INTO v_current FROM users_coins WHERE user_id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins', 'balance', v_current);
  END IF;
  UPDATE users_coins SET coins = coins - p_amount, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'spend', -p_amount, COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_amount);
END;
$$;
REVOKE EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deduct_coins(UUID, INTEGER, TEXT, JSONB) TO authenticated, service_role;

-- SEND GIFT FUNCTION
CREATE OR REPLACE FUNCTION send_gift(
  p_sender_id   UUID,
  p_receiver_id UUID,
  p_gift_type   TEXT,
  p_coins_cost  INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  v_deduct_res := deduct_coins(p_sender_id, p_coins_cost, 'gift', jsonb_build_object('gift_type', p_gift_type, 'to', p_receiver_id));
  IF NOT (v_deduct_res->>'success')::boolean THEN
    RETURN v_deduct_res;
  END IF;
  INSERT INTO users_coins (user_id, coins) VALUES (p_receiver_id, v_earned)
  ON CONFLICT (user_id) DO UPDATE SET coins = users_coins.coins + v_earned, updated_at = NOW();
  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned, jsonb_build_object('gift_type', p_gift_type, 'from', p_sender_id));
  INSERT INTO gifts (sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, p_coins_cost, v_earned) RETURNING id INTO v_gift_id;
  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;
REVOKE EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_gift(UUID, UUID, TEXT, INTEGER) TO authenticated, service_role;

-- CLAIM DAILY BONUS FUNCTION
CREATE OR REPLACE FUNCTION claim_daily_bonus(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bonus INTEGER := 10;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO daily_bonus_claims (user_id, claimed_on) VALUES (p_user_id, CURRENT_DATE);
  INSERT INTO users_coins (user_id, coins) VALUES (p_user_id, v_bonus)
  ON CONFLICT (user_id) DO UPDATE SET coins = users_coins.coins + v_bonus, updated_at = NOW();
  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'bonus', v_bonus, '{"reason":"daily_login"}');
  RETURN jsonb_build_object('success', true, 'bonus', v_bonus);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_claimed_today');
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_daily_bonus(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_daily_bonus(UUID) TO authenticated, service_role;

-- INCREMENT COINS (used by Xsolla webhook — server-only)
CREATE OR REPLACE FUNCTION increment_coins(p_user_id UUID, p_amount INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'increment_coins: amount must be positive';
  END IF;
  INSERT INTO users_coins (user_id, coins) VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET coins = users_coins.coins + p_amount, updated_at = NOW();
END;
$$;
REVOKE EXECUTE ON FUNCTION increment_coins(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_coins(UUID, INTEGER) TO service_role;

-- RLS POLICIES
ALTER TABLE users_coins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_bonus_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own coins" ON users_coins;
CREATE POLICY "read own coins" ON users_coins FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "read own transactions" ON transactions;
CREATE POLICY "read own transactions" ON transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "read own gifts" ON gifts;
CREATE POLICY "read own gifts" ON gifts FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "read own withdrawals" ON withdrawals;
CREATE POLICY "read own withdrawals" ON withdrawals FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own withdrawal" ON withdrawals;
CREATE POLICY "insert own withdrawal" ON withdrawals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "read own vip" ON vip_subscriptions;
CREATE POLICY "read own vip" ON vip_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "stripe_events no client access" ON stripe_events;
CREATE POLICY "stripe_events no client access" ON stripe_events FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "daily_bonus read own" ON daily_bonus_claims;
CREATE POLICY "daily_bonus read own" ON daily_bonus_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Defense-in-depth: wallets/ledger/gifts are ONLY written through RPCs
REVOKE INSERT, UPDATE, DELETE ON users_coins  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON gifts        FROM anon, authenticated;
REVOKE UPDATE, DELETE ON withdrawals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON daily_bonus_claims FROM anon, authenticated;