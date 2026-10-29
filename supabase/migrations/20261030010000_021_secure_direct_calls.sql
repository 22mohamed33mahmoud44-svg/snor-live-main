-- Give direct calls an authenticated, explicit invitation/acceptance lifecycle.
-- The random matchmaking path continues using kind='random' and status='active'.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'random';

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN ('pending', 'active', 'ended'));

ALTER TABLE public.matches
  ADD CONSTRAINT matches_kind_check
  CHECK (kind IN ('random', 'direct'));

CREATE INDEX IF NOT EXISTS matches_direct_pending_recipient_idx
  ON public.matches (user2, created_at DESC)
  WHERE kind = 'direct' AND status = 'pending';

-- Clients may end active calls, but cannot turn a pending invitation into
-- an active call: that transition is reserved for respond_direct_call().
DROP POLICY IF EXISTS "matches update participant authenticated" ON public.matches;
CREATE POLICY "matches update participant authenticated"
ON public.matches FOR UPDATE TO authenticated
USING (
  status = 'active'
  AND (user1 = (SELECT auth.uid()) OR user2 = (SELECT auth.uid()))
)
WITH CHECK (
  status = 'ended'
  AND (user1 = (SELECT auth.uid()) OR user2 = (SELECT auth.uid()))
);

CREATE OR REPLACE FUNCTION public.create_direct_call(p_callee uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_match_id uuid;
BEGIN
  IF v_caller IS NULL OR p_callee IS NULL OR p_callee = v_caller THEN
    RAISE EXCEPTION 'Unauthorized direct call';
  END IF;

  -- Serialize invitations between the same two participants.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      LEAST(v_caller::text, p_callee::text) || ':' ||
      GREATEST(v_caller::text, p_callee::text), 0
    )
  );

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_callee) THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- A call from an existing private chat cannot be sent to a stranger.
  IF NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE (sender_id = v_caller AND receiver_id = p_callee)
       OR (sender_id = p_callee AND receiver_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Start a conversation before calling';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = v_caller AND blocked_id = p_callee)
       OR (blocker_id = p_callee AND blocked_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Call not allowed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE (user1 IN (v_caller, p_callee) OR user2 IN (v_caller, p_callee))
      AND (
        status = 'active'
        OR (kind = 'direct' AND status = 'pending'
            AND created_at > now() - interval '2 minutes')
      )
  ) THEN
    RAISE EXCEPTION 'A participant is already in a call';
  END IF;

  INSERT INTO public.matches (user1, user2, kind, status)
  VALUES (v_caller, p_callee, 'direct', 'pending')
  RETURNING id INTO v_match_id;

  RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_direct_call(p_match_id uuid, p_accept boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_match_id IS NULL OR p_accept IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.matches
     SET status = CASE WHEN p_accept THEN 'active' ELSE 'ended' END
   WHERE id = p_match_id
     AND kind = 'direct'
     AND user2 = auth.uid()
     AND status = 'pending'
     AND created_at > now() - interval '2 minutes'
  RETURNING id INTO v_match_id;

  RETURN v_match_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_call(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_call(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_direct_call(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_direct_call(uuid,boolean) TO authenticated;
