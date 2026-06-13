-- Snor Live: matching, signaling, payments

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  gender      TEXT,
  birthdate   DATE,
  looking_for TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles read own" ON profiles;
DROP POLICY IF EXISTS "profiles insert own" ON profiles;
DROP POLICY IF EXISTS "profiles update own" ON profiles;
CREATE POLICY "profiles insert own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update own" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS waiting_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waiting_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waiting read own" ON waiting_users;
DROP POLICY IF EXISTS "waiting delete own" ON waiting_users;
CREATE POLICY "waiting read own" ON waiting_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "waiting delete own" ON waiting_users FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT matches_distinct_users CHECK (user1 <> user2)
);

CREATE INDEX IF NOT EXISTS idx_matches_users ON matches (user1, user2);
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "matches read participant" ON matches;
CREATE POLICY "matches read participant" ON matches
  FOR SELECT USING (auth.uid() = user1 OR auth.uid() = user2);

CREATE TABLE IF NOT EXISTS signals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_match ON signals (match_id, created_at);
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signals read match participant" ON signals;
DROP POLICY IF EXISTS "signals insert match participant" ON signals;
CREATE POLICY "signals read match participant" ON signals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid()))
  );
CREATE POLICY "signals insert match participant" ON signals
  FOR INSERT WITH CHECK (
    auth.uid() = sender AND
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid()))
  );

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages read match participant" ON messages;
DROP POLICY IF EXISTS "messages insert match participant" ON messages;
CREATE POLICY "messages read match participant" ON messages
  FOR SELECT USING (auth.uid()::text = sender_id::text OR
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid()))
  );
CREATE POLICY "messages insert match participant" ON messages
  FOR INSERT WITH CHECK (auth.uid()::text = sender_id::text);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions (user_id, created_at DESC);
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_tx read own" ON coin_transactions;
CREATE POLICY "coin_tx read own" ON coin_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS paymob_events (
  transaction_id TEXT PRIMARY KEY,
  status         TEXT NOT NULL,
  processed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION atomic_match_or_wait(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner UUID;
  v_match   matches%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT user_id INTO v_partner FROM waiting_users
  WHERE user_id <> p_user_id ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_partner IS NOT NULL THEN
    DELETE FROM waiting_users WHERE user_id IN (v_partner, p_user_id);
    INSERT INTO matches (user1, user2, status) VALUES (v_partner, p_user_id, 'active') RETURNING * INTO v_match;
    RETURN jsonb_build_object('status','matched','match',jsonb_build_object('id',v_match.id,'user1',v_match.user1,'user2',v_match.user2,'status',v_match.status,'created_at',v_match.created_at));
  END IF;
  INSERT INTO waiting_users (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('status','waiting');
END;
$$;

CREATE OR REPLACE FUNCTION cancel_waiting(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM waiting_users WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_match_or_wait(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_waiting(UUID) TO authenticated;
