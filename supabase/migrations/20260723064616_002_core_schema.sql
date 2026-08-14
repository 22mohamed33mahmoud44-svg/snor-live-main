/*
# Core Schema — Profiles, Matching, Messaging, Payments

Creates the social/matching backbone of the app: user profiles, the random
match queue, match records, WebRTC signaling, private messages, coin
transaction log, and Paymob event tracking. Includes the atomic matchmaking
RPC that either pairs two waiting users or adds the caller to the queue.

## New Tables
1. `profiles` — user profile (PK = auth.users.id), username/gender/birthdate/avatar
2. `waiting_users` — matchmaking queue (one row per waiting user)
3. `matches` — paired users with status (active/ended)
4. `signals` — WebRTC signaling messages (offer/answer/ICE) tied to a match
5. `messages` — private chat messages between matched users
6. `coin_transactions` — separate coin payment ledger (Paymob/Xsolla)
7. `paymob_events` — Paymob webhook idempotency

## RPCs
- `atomic_match_or_wait(p_user_id)` — atomically pair or queue
- `cancel_waiting(p_user_id)` — leave the queue
- `get_user_conversations(p_user_id)` — returns partner_id, last_message, last_time, unread_count

## Views
- `public_profiles` — safe subset of profiles (no birthdate/looking_for)

## Security
- RLS enabled on all tables
- Owner-scoped policies (authenticated users access only their own data)
- `public_profiles` view grants SELECT to authenticated (safe columns only)
*/

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  full_name   TEXT,
  gender      TEXT,
  birthdate   DATE,
  looking_for TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles insert own" ON profiles;
CREATE POLICY "profiles insert own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles update own" ON profiles;
CREATE POLICY "profiles update own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles read own" ON profiles;
CREATE POLICY "profiles read own" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- WAITING USERS (matchmaking queue)
CREATE TABLE IF NOT EXISTS waiting_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waiting_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waiting read own" ON waiting_users;
CREATE POLICY "waiting read own" ON waiting_users FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "waiting delete own" ON waiting_users;
CREATE POLICY "waiting delete own" ON waiting_users FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_waiting_created ON waiting_users (created_at);

-- MATCHES
CREATE TABLE IF NOT EXISTS matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT matches_distinct_users CHECK (user1 <> user2)
);

CREATE INDEX IF NOT EXISTS idx_matches_users ON matches (user1, user2);
CREATE INDEX IF NOT EXISTS idx_matches_active ON matches (status, created_at DESC);
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "matches read participant" ON matches;
CREATE POLICY "matches read participant" ON matches FOR SELECT TO authenticated USING (auth.uid() = user1 OR auth.uid() = user2);
DROP POLICY IF EXISTS "matches update participant" ON matches;
CREATE POLICY "matches update participant" ON matches FOR UPDATE TO authenticated
  USING (auth.uid() = user1 OR auth.uid() = user2)
  WITH CHECK ((auth.uid() = user1 OR auth.uid() = user2) AND status IN ('active', 'ended'));
REVOKE UPDATE ON matches FROM anon, authenticated;
GRANT UPDATE (status) ON matches TO authenticated;

-- SIGNALS (WebRTC)
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
CREATE POLICY "signals read match participant" ON signals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid())));
DROP POLICY IF EXISTS "signals insert match participant" ON signals;
CREATE POLICY "signals insert match participant" ON signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender AND EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid())));

-- MESSAGES (private chat)
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages read match participant" ON messages;
CREATE POLICY "messages read match participant" ON messages FOR SELECT TO authenticated
  USING (auth.uid()::text = sender_id::text OR
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND (m.user1 = auth.uid() OR m.user2 = auth.uid())));
DROP POLICY IF EXISTS "messages insert match participant" ON messages;
CREATE POLICY "messages insert match participant" ON messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = sender_id::text);
DROP POLICY IF EXISTS "messages update own" ON messages;
CREATE POLICY "messages update own" ON messages FOR UPDATE TO authenticated
  USING (auth.uid()::text = sender_id::text) WITH CHECK (auth.uid()::text = sender_id::text);

-- COIN TRANSACTIONS (Paymob/Xsolla payment ledger)
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
CREATE POLICY "coin_tx read own" ON coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "coin_tx service insert" ON coin_transactions;
CREATE POLICY "coin_tx service insert" ON coin_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- PAYMOB EVENTS
CREATE TABLE IF NOT EXISTS paymob_events (
  transaction_id TEXT PRIMARY KEY,
  status         TEXT NOT NULL,
  processed_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE paymob_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paymob_events no access" ON paymob_events;
CREATE POLICY "paymob_events no access" ON paymob_events FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- PUBLIC PROFILES VIEW (safe columns only — no birthdate/looking_for)
DROP VIEW IF EXISTS public_profiles CASCADE;
CREATE OR REPLACE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, gender FROM profiles;
REVOKE ALL ON public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public_profiles TO authenticated, service_role;

-- ── RPCs ──

-- Atomic matchmaking
CREATE OR REPLACE FUNCTION atomic_match_or_wait(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION atomic_match_or_wait(UUID) TO authenticated;

-- Cancel waiting
CREATE OR REPLACE FUNCTION cancel_waiting(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM waiting_users WHERE user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_waiting(UUID) TO authenticated;

-- Get user conversations (for Dashboard chat list)
CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS TABLE (
  partner_id UUID,
  last_message TEXT,
  last_time TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT
      CASE WHEN m.sender_id = p_user_id THEN m2.user2 ELSE m2.user1 END AS partner_id,
      (array_agg(m.message ORDER BY m.created_at DESC))[1] AS last_message,
      max(m.created_at) AS last_time,
      count(*) FILTER (WHERE m.sender_id <> p_user_id AND m.read = false) AS unread_count
    FROM messages m
    JOIN matches m2 ON m2.id = m.match_id
    WHERE (m2.user1 = p_user_id OR m2.user2 = p_user_id)
      AND m2.status <> 'ended'
    GROUP BY CASE WHEN m.sender_id = p_user_id THEN m2.user2 ELSE m2.user1 END;
END;
$$;
GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated;

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_waiting_users()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM waiting_users WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_matchmaking()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM waiting_users WHERE created_at < NOW() - INTERVAL '5 minutes';
  UPDATE matches SET status = 'ended' WHERE status = 'active' AND created_at < NOW() - INTERVAL '2 hours';
  DELETE FROM signals WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$;
REVOKE EXECUTE ON FUNCTION cleanup_waiting_users() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_matchmaking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_matchmaking() TO service_role;

-- Schedule cleanup via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-matchmaking', '* * * * *', 'SELECT public.cleanup_matchmaking()');
  ELSE
    RAISE NOTICE 'pg_cron not installed — cleanup_matchmaking() will need manual scheduling';
  END IF;
END;
$$;