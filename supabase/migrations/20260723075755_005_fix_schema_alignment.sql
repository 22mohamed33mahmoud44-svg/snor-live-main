/*
# Fix DB Schema — Align with Frontend Expectations

1. transactions: add status, provider, provider_txn_id + unique index (for Xsolla)
2. public_profiles: create view (Dashboard depends on it)
3. get_user_conversations: make SECURITY DEFINER
4. live_streams: add viewers_count column
5. profiles: add looking_for column
*/

-- 1. transactions: add missing columns for Xsolla
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_txn_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_txn_unique
  ON transactions (provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;

-- 2. public_profiles view (safe columns only)
CREATE OR REPLACE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, gender FROM profiles;
REVOKE ALL ON public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public_profiles TO authenticated;

-- 3. Fix get_user_conversations: make SECURITY DEFINER
-- The existing messages table uses receiver_id (not match-based),
-- so the RPC must work with that schema.
CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS TABLE (
  partner_id UUID,
  last_message TEXT,
  last_time TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
    SELECT
      CASE WHEN m.sender_id = p_user_id::text THEN m.receiver_id ELSE m.sender_id::uuid END AS partner_id,
      (array_agg(m.message ORDER BY m.created_at DESC))[1] AS last_message,
      max(m.created_at)::timestamptz AS last_time,
      count(*) FILTER (WHERE m.sender_id <> p_user_id::text AND m.read = false) AS unread_count
    FROM messages m
    WHERE m.sender_id = p_user_id::text OR m.receiver_id = p_user_id
    GROUP BY CASE WHEN m.sender_id = p_user_id::text THEN m.receiver_id ELSE m.sender_id::uuid END;
END;
$$;
GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated;

-- 4. live_streams: add viewers_count
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS viewers_count INTEGER NOT NULL DEFAULT 0;

-- 5. profiles: add looking_for
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS looking_for TEXT;