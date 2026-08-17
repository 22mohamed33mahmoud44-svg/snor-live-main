-- Fix matchmaking queue races and stale entries without modifying older migrations.
-- This migration makes the matchmaking RPC ignore entries older than 5 minutes
-- and refreshes the current user's queue timestamp when they retry.

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
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Remove stale queue entries before matching. This makes the RPC safe even
  -- when the scheduled cleanup function has not run recently.
  DELETE FROM waiting_users
  WHERE created_at < NOW() - INTERVAL '5 minutes';

  -- Remove the caller's previous queue entry so a retry always gets a fresh
  -- timestamp and cannot remain stale indefinitely.
  DELETE FROM waiting_users
  WHERE user_id = p_user_id;

  SELECT user_id INTO v_partner
  FROM waiting_users
  WHERE user_id <> p_user_id
    AND created_at >= NOW() - INTERVAL '5 minutes'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_partner IS NOT NULL THEN
    DELETE FROM waiting_users
    WHERE user_id IN (v_partner, p_user_id);

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

  INSERT INTO waiting_users (user_id, created_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET created_at = EXCLUDED.created_at;

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
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM waiting_users WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION atomic_match_or_wait(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atomic_match_or_wait(UUID) TO authenticated;

REVOKE ALL ON FUNCTION cancel_waiting(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_waiting(UUID) TO authenticated;
