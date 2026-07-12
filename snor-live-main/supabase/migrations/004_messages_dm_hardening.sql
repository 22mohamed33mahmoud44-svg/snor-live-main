-- ============================================================
-- 004: Direct-message hardening for `messages`
--
-- Context: the live `messages` table is used as a DM table
-- (sender_id, receiver_id, read) by PrivateChat/ChatsTab, but
-- migration 001 defined it as a match-chat table with stale RLS
-- policies. This migration reconciles the schema, locks down
-- RLS for the DM shape, and scopes Realtime correctly.
--
-- With RLS enabled on `messages`, Supabase Realtime
-- (postgres_changes) authorizes every event per-subscriber:
-- a client only receives INSERT/UPDATE events for rows its JWT
-- can SELECT. This is the actual privacy fix; the client-side
-- `filter:` params (added in the frontend) reduce fan-out and
-- wasted work on top of it.
-- ============================================================

-- ── 1. Reconcile schema (no-ops if the live table already matches)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

-- If the legacy match_id column exists and is NOT NULL, relax it so DM inserts work.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'match_id'
  ) THEN
    ALTER TABLE messages ALTER COLUMN match_id DROP NOT NULL;
  END IF;
END $$;

-- ── 2. Indexes for the DM access patterns
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pair     ON messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread   ON messages (receiver_id) WHERE read = false;

-- ── 3. RLS: only conversation participants can see a message
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages read match participant"   ON messages;
DROP POLICY IF EXISTS "messages insert match participant" ON messages;
DROP POLICY IF EXISTS "dm select participants"            ON messages;
DROP POLICY IF EXISTS "dm insert sender"                  ON messages;
DROP POLICY IF EXISTS "dm update receiver read"           ON messages;

CREATE POLICY "dm select participants" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "dm insert sender" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id AND receiver_id IS NOT NULL AND auth.uid() <> receiver_id);

-- Only the receiver may update a message, and (via column grants below)
-- only the `read` flag — never the message body.
CREATE POLICY "dm update receiver read" ON messages
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Column-level lockdown: clients can only flip `read`, nothing else.
REVOKE UPDATE ON messages FROM authenticated;
GRANT  UPDATE (read) ON messages TO authenticated;
REVOKE DELETE ON messages FROM authenticated;

-- ── 4. Realtime configuration
-- REPLICA IDENTITY FULL so UPDATE events carry the full old row,
-- letting Realtime evaluate RLS + server-side filters correctly.
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Ensure the table is in the realtime publication (idempotent).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
