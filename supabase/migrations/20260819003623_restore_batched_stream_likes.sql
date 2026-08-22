-- Restore the batch likes RPC used by ViewerLiveRoom.
-- Guests may use this endpoint because live streams are publicly viewable.

DROP FUNCTION IF EXISTS public.increment_stream_likes(uuid);

CREATE FUNCTION public.increment_stream_likes(
  target_stream_id uuid,
  increment_count integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF increment_count IS NULL OR increment_count <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.live_streams
  SET likes_count = COALESCE(likes_count, 0) + increment_count
  WHERE id = target_stream_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_stream_likes(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_stream_likes(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.increment_stream_likes(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_stream_likes(uuid, integer) TO anon, authenticated, service_role;
