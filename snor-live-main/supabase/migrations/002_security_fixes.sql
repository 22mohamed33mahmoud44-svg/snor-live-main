-- ── 1. Fix RPC impersonation ─────────────────────────────────────
CREATE OR REPLACE FUNCTION atomic_match_or_wait(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner UUID;
  v_match   matches%ROWTYPE;
BEGIN
  -- Security: caller must be the user
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT user_id INTO v_partner
  FROM waiting_users
  WHERE user_id <> p_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner IS NOT NULL THEN
    DELETE FROM waiting_users WHERE user_id IN (v_partner, p_user_id);

    INSERT INTO matches (user1, user2, status)
    VALUES (v_partner, p_user_id, 'active')
    RETURNING * INTO v_match;

    RETURN jsonb_build_object(
      'status', 'matched',
      'match', jsonb_build_object(
        'id',         v_match.id,
        'user1',      v_match.user1,
        'user2',      v_match.user2,
        'status',     v_match.status,
        'created_at', v_match.created_at
      )
    );
  END IF;

  INSERT INTO waiting_users (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('status', 'waiting');
END;
$$;

CREATE OR REPLACE FUNCTION cancel_waiting(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security: caller must be the user
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM waiting_users WHERE user_id = p_user_id;
END;
$$;

-- ── 2. Enable RLS on paymob_events ───────────────────────────────
ALTER TABLE paymob_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paymob_events no access" ON paymob_events;
CREATE POLICY "paymob_events no access" ON paymob_events
  FOR ALL USING (false);

-- ── 3. Enable RLS on coin_transactions insert ────────────────────
DROP POLICY IF EXISTS "coin_tx service insert" ON coin_transactions;
CREATE POLICY "coin_tx service insert" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 4. Discover profiles policy ──────────────────────────────────
DROP POLICY IF EXISTS "profiles read public" ON profiles;
CREATE POLICY "profiles read public" ON profiles
  FOR SELECT USING (true);

-- ── 5. TTL for waiting_users (5 min expiry) ──────────────────────
CREATE OR REPLACE FUNCTION cleanup_waiting_users()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM waiting_users
  WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$;
