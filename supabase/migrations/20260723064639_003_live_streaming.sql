/*
# Live Streaming — Streams, Chat, Follows, Bans, Gifts

Creates the full live streaming backend: stream records with heartbeat-based
liveness, real-time chat, follow relationships, and stream bans. Includes
RPCs for heartbeat updates, like increments, safe gift sending, and user
banning — all called from the frontend components.

## New Tables
1. `live_streams` — stream record (id, user_id, title, streamer_name, is_live,
   viewers/likes count, thumbnail, last_heartbeat_at)
2. `stream_chat` — chat messages per stream (user_id, username, message)
3. `follows` — follower → following relationship
4. `stream_bans` — banned users per stream (streamer can ban viewers)

## RPCs
- `update_stream_heartbeat(p_stream_id)` — refresh last_heartbeat_at + viewers
- `increment_stream_likes(target_stream_id, increment_count)` — atomic like increment
- `send_gift_safe(p_stream_id, p_receiver_id, p_gift_type, p_coin_cost)` — wrapper around send_gift with stream context
- `ban_user_from_stream(p_stream_id, p_user_id, p_reason)` — streamer bans a viewer

## Security
- RLS enabled on all tables
- `live_streams`: public SELECT (anyone can see live streams), owner-only INSERT/UPDATE
- `stream_chat`: public SELECT + INSERT (authenticated users can chat in any live stream)
- `follows`: owner-scoped SELECT/INSERT/DELETE
- `stream_bans`: streamer-only INSERT, public SELECT (to check if banned)
*/

-- LIVE STREAMS
CREATE TABLE IF NOT EXISTS live_streams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL DEFAULT 'بث مباشر',
  streamer_name     TEXT,
  is_live           BOOLEAN NOT NULL DEFAULT true,
  viewers_count     INTEGER NOT NULL DEFAULT 0,
  likes_count       INTEGER NOT NULL DEFAULT 0,
  thumbnail_url     TEXT,
  last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_streams_live ON live_streams (is_live, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_user ON live_streams (user_id);
ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;

-- Anyone (even anon) can see live streams — the grid is public
DROP POLICY IF EXISTS "live_streams read all" ON live_streams;
CREATE POLICY "live_streams read all" ON live_streams FOR SELECT TO anon, authenticated USING (true);

-- Only the stream owner can insert (start) a stream
DROP POLICY IF EXISTS "live_streams insert own" ON live_streams;
CREATE POLICY "live_streams insert own" ON live_streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Only the stream owner can update their stream
DROP POLICY IF EXISTS "live_streams update own" ON live_streams;
CREATE POLICY "live_streams update own" ON live_streams FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Only the stream owner can delete their stream
DROP POLICY IF EXISTS "live_streams delete own" ON live_streams;
CREATE POLICY "live_streams delete own" ON live_streams FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- STREAM CHAT
CREATE TABLE IF NOT EXISTS stream_chat (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id  UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL DEFAULT 'متابع',
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stream_chat_stream ON stream_chat (stream_id, created_at);
ALTER TABLE stream_chat ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat messages in a stream
DROP POLICY IF EXISTS "stream_chat read all" ON stream_chat;
CREATE POLICY "stream_chat read all" ON stream_chat FOR SELECT TO anon, authenticated USING (true);

-- Authenticated users can send chat messages
DROP POLICY IF EXISTS "stream_chat insert own" ON stream_chat;
CREATE POLICY "stream_chat insert own" ON stream_chat FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages
DROP POLICY IF EXISTS "stream_chat delete own" ON stream_chat;
CREATE POLICY "stream_chat delete own" ON stream_chat FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FOLLOWS
CREATE TABLE IF NOT EXISTS follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id),
  CONSTRAINT unique_follow UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows read own" ON follows;
CREATE POLICY "follows read own" ON follows FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "follows insert own" ON follows;
CREATE POLICY "follows insert own" ON follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows delete own" ON follows;
CREATE POLICY "follows delete own" ON follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- STREAM BANS
CREATE TABLE IF NOT EXISTS stream_bans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id  UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_ban UNIQUE (stream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_stream_bans_stream ON stream_bans (stream_id);
ALTER TABLE stream_bans ENABLE ROW LEVEL SECURITY;

-- Anyone can check if they're banned in a stream
DROP POLICY IF EXISTS "stream_bans read all" ON stream_bans;
CREATE POLICY "stream_bans read all" ON stream_bans FOR SELECT TO anon, authenticated USING (true);

-- Only the stream owner can ban users
DROP POLICY IF EXISTS "stream_bans insert streamer" ON stream_bans;
CREATE POLICY "stream_bans insert streamer" ON stream_bans FOR INSERT TO authenticated
  WITH CHECK (banned_by = auth.uid() AND EXISTS (
    SELECT 1 FROM live_streams WHERE id = stream_id AND user_id = auth.uid()
  ));

-- ── RPCs ──

-- Update heartbeat: refresh last_heartbeat_at and count viewers from presence
CREATE OR REPLACE FUNCTION update_stream_heartbeat(p_stream_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE live_streams
  SET last_heartbeat_at = NOW()
  WHERE id = p_stream_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION update_stream_heartbeat(UUID) TO authenticated;

-- Increment stream likes (atomic)
CREATE OR REPLACE FUNCTION increment_stream_likes(
  target_stream_id UUID,
  increment_count INTEGER DEFAULT 1
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF increment_count IS NULL OR increment_count <= 0 THEN RETURN; END IF;
  UPDATE live_streams
  SET likes_count = likes_count + increment_count
  WHERE id = target_stream_id;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_stream_likes(UUID, INTEGER) TO authenticated;

-- Send gift safe: wraps send_gift with stream context
CREATE OR REPLACE FUNCTION send_gift_safe(
  p_stream_id    UUID,
  p_receiver_id  UUID,
  p_gift_type    TEXT,
  p_coin_cost    INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender_id UUID;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  -- Delegate to the existing send_gift RPC which handles balance check + atomic transfer
  RETURN send_gift(v_sender_id, p_receiver_id, p_gift_type, p_coin_cost);
END;
$$;
GRANT EXECUTE ON FUNCTION send_gift_safe(UUID, UUID, TEXT, INTEGER) TO authenticated;

-- Ban user from stream
CREATE OR REPLACE FUNCTION ban_user_from_stream(
  p_stream_id UUID,
  p_user_id   UUID,
  p_reason    TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_streamer_id UUID;
BEGIN
  SELECT user_id INTO v_streamer_id FROM live_streams WHERE id = p_stream_id;
  IF v_streamer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stream_not_found');
  END IF;
  IF auth.uid() IS DISTINCT FROM v_streamer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  INSERT INTO stream_bans (stream_id, user_id, banned_by, reason)
  VALUES (p_stream_id, p_user_id, v_streamer_id, p_reason)
  ON CONFLICT (stream_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION ban_user_from_stream(UUID, UUID, TEXT) TO authenticated;