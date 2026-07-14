-- ============================================================
-- 005: Ensure `matches` is broadcast over Supabase Realtime
--
-- RandomMatch.tsx relies on postgres_changes INSERT events on
-- `matches` (filtered by user1/user2). None of the repo
-- migrations added the table to the realtime publication —
-- if it is missing in production, the waiting user NEVER hears
-- about the match and only the new fallback polling saves them.
-- This makes the fast path guaranteed.
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE matches;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS already restricts SELECT to participants ("matches read
-- participant" from 001), so Realtime will only deliver a match
-- row to its two participants — no data leak from broadcasting.
