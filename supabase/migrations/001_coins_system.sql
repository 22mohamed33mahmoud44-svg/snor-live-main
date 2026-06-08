-- USERS COINS
CREATE TABLE users_coins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins      INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('buy','spend','earn','bonus','refund')),
  amount     INTEGER NOT NULL,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);

-- GIFTS
CREATE TABLE gifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES auth.users(id),
  receiver_id  UUID NOT NULL REFERENCES auth.users(id),
  gift_type    TEXT NOT NULL,
  coins_cost   INTEGER NOT NULL,
  coins_earned INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_gift CHECK (sender_id <> receiver_id)
);
CREATE INDEX idx_gifts_receiver ON gifts(receiver_id, created_at DESC);

-- WITHDRAWALS
CREATE TABLE withdrawals (
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
CREATE TABLE vip_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  tier          TEXT NOT NULL CHECK (tier IN ('silver','gold','diamond')),
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  stripe_sub_id TEXT
);

-- STRIPE EVENTS (idempotency)
CREATE TABLE stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY BONUS
CREATE TABLE daily_bonus_claims (
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  claimed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, claimed_on)
);

-- AUTO CREATE COINS ROW ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users_coins (user_id, coins) VALUES (NEW.id, 10);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ADD COINS FUNCTION
CREATE OR REPLACE FUNCTION add_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users_coins (user_id, coins)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = users_coins.coins + p_amount, updated_at = NOW();

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'buy', p_amount, p_meta);
END;
$$;

-- DEDUCT COINS FUNCTION
CREATE OR REPLACE FUNCTION deduct_coins(
  p_user_id UUID,
  p_amount  INTEGER,
  p_reason  TEXT,
  p_meta    JSONB DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current INTEGER;
BEGIN
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
  VALUES (p_user_id, 'spend', -p_amount, p_meta || jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_amount);
END;
$$;

-- SEND GIFT FUNCTION
CREATE OR REPLACE FUNCTION send_gift(
  p_sender_id   UUID,
  p_receiver_id UUID,
  p_gift_type   TEXT,
  p_coins_cost  INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_earned     INTEGER;
  v_gift_id    UUID;
  v_deduct_res JSONB;
BEGIN
  v_earned := FLOOR(p_coins_cost * 0.70);

  v_deduct_res := deduct_coins(
    p_sender_id, p_coins_cost, 'gift',
    jsonb_build_object('gift_type', p_gift_type, 'to', p_receiver_id)
  );

  IF NOT (v_deduct_res->>'success')::boolean THEN
    RETURN v_deduct_res;
  END IF;

  UPDATE users_coins
  SET coins = coins + v_earned, updated_at = NOW()
  WHERE user_id = p_receiver_id;

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned,
    jsonb_build_object('gift_type', p_gift_type, 'from', p_sender_id));

  INSERT INTO gifts (sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, p_coins_cost, v_earned)
  RETURNING id INTO v_gift_id;

  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;

-- CLAIM DAILY BONUS FUNCTION
CREATE OR REPLACE FUNCTION claim_daily_bonus(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bonus INTEGER := 10;
BEGIN
  INSERT INTO daily_bonus_claims (user_id, claimed_on)
  VALUES (p_user_id, CURRENT_DATE);

  UPDATE users_coins
  SET coins = coins + v_bonus, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'bonus', v_bonus, '{"reason":"daily_login"}');

  RETURN jsonb_build_object('success', true, 'bonus', v_bonus);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_claimed_today');
END;
$$;

-- RLS POLICIES
ALTER TABLE users_coins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_subscriptions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own coins"         ON users_coins       FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "read own transactions"  ON transactions      FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "read own gifts"         ON gifts             FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "read own withdrawals"   ON withdrawals       FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own withdrawal"  ON withdrawals       FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read own vip"           ON vip_subscriptions FOR SELECT USING (auth.uid() = user_id);
