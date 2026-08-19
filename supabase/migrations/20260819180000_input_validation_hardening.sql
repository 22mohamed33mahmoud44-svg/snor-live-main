/*
# Input Validation Hardening

1. stream_chat: the client supplied both `user_id` and `username` on insert.
   RLS only enforced `user_id = auth.uid()`, so any viewer could post chat
   messages under an arbitrary display name (impersonating a streamer or
   another viewer). A BEFORE INSERT trigger now derives both columns
   server-side from the caller's session and profile.

2. increment_stream_likes accepted an unbounded batch count from anon
   callers; it is now clamped per call.

3. Length limits on user-supplied text (chat messages, private messages,
   stream titles) — previously unbounded TEXT, allowing multi-megabyte
   payloads. Added NOT VALID so existing rows are not re-validated.
*/

-- ── 1. stream_chat: server-side identity ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_stream_chat_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role callers (auth.uid() IS NULL) keep the values they pass.
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
    NEW.username := COALESCE(
      NULLIF((SELECT username FROM profiles WHERE id = auth.uid()), ''),
      NULLIF((SELECT full_name FROM profiles WHERE id = auth.uid()), ''),
      'متابع'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stream_chat_set_identity ON stream_chat;
CREATE TRIGGER stream_chat_set_identity
  BEFORE INSERT ON stream_chat
  FOR EACH ROW EXECUTE FUNCTION public.set_stream_chat_identity();

-- ── 2. increment_stream_likes: clamp the batch size ───────────────
-- Callable by anon, so an unbounded increment let anyone set likes_count
-- to any value in a single call.
CREATE OR REPLACE FUNCTION public.increment_stream_likes(
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
  SET likes_count = COALESCE(likes_count, 0) + LEAST(increment_count, 100)
  WHERE id = target_stream_id;
END;
$$;

-- ── 3. Length limits on user-supplied text ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stream_chat_message_length'
  ) THEN
    ALTER TABLE stream_chat
      ADD CONSTRAINT stream_chat_message_length
      CHECK (char_length(message) BETWEEN 1 AND 500) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_message_length'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_message_length
      CHECK (char_length(message) BETWEEN 1 AND 2000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'live_streams_title_length'
  ) THEN
    ALTER TABLE live_streams
      ADD CONSTRAINT live_streams_title_length
      CHECK (char_length(title) <= 100) NOT VALID;
  END IF;
END $$;
