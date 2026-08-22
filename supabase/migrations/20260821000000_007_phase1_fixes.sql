/*
# Migration 007: Phase 1 Security & Consistency Fixes
# =====================================================
# 1. RLS policies on blocked_users
# 2. RLS policies on gift_logs
# 3. Canonical send_stream_gift() replacing duplicate overloads
# 4. Indexes on private_messages, blocked_users
# 5. FK constraint: gift_logs.stream_id → live_streams.id
*/

-- ── 1. RLS: blocked_users ──
DROP POLICY IF EXISTS "blocked_users read own" ON public.blocked_users;
CREATE POLICY "blocked_users read own" ON public.blocked_users
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "blocked_users insert own" ON public.blocked_users;
CREATE POLICY "blocked_users insert own" ON public.blocked_users
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocked_users delete own" ON public.blocked_users;
CREATE POLICY "blocked_users delete own" ON public.blocked_users
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

REVOKE UPDATE ON public.blocked_users FROM anon, authenticated;

-- ── 2. RLS: gift_logs ──
DROP POLICY IF EXISTS "gift_logs read own" ON public.gift_logs;
CREATE POLICY "gift_logs read own" ON public.gift_logs
  FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "gift_logs insert own" ON public.gift_logs;
CREATE POLICY "gift_logs insert own" ON public.gift_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

REVOKE UPDATE, DELETE ON public.gift_logs FROM anon, authenticated;

-- ── 3. Canonical send_stream_gift() ──
DROP FUNCTION IF EXISTS public.send_stream_gift(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.send_stream_gift(stream_id_in uuid, gift_type_in text, receiver_id_in uuid);
DROP FUNCTION IF EXISTS public.send_stream_gift(target_stream_id uuid, gift_name text, gift_cost integer);
DROP FUNCTION IF EXISTS public.send_stream_gift(stream_id_input uuid, receiver_id_input uuid, gift_type_input text, coins_cost_input integer);

CREATE OR REPLACE FUNCTION public.send_stream_gift(
  p_stream_id   UUID,
  p_receiver_id UUID,
  p_gift_type   TEXT,
  p_coin_cost   INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_result    JSONB;
BEGIN
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_result := send_gift(v_sender_id, p_receiver_id, p_gift_type, p_coin_cost);
  IF (v_result->>'success')::boolean THEN
    INSERT INTO gift_logs (sender_id, receiver_id, stream_id, gift_type, coin_cost)
    VALUES (v_sender_id, p_receiver_id, p_stream_id, p_gift_type, p_coin_cost);
  END IF;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(UUID, UUID, TEXT, INTEGER) TO authenticated;

-- ── 4. Indexes ──
CREATE INDEX IF NOT EXISTS idx_private_messages_sender   ON public.private_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_messages_receiver ON public.private_messages(receiver_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_users_unique   ON public.blocked_users(blocker_id, blocked_id);

-- ── 5. FK: gift_logs.stream_id → live_streams.id ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'gift_logs_stream_id_fkey'
  ) THEN
    ALTER TABLE public.gift_logs
      ADD CONSTRAINT gift_logs_stream_id_fkey
      FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
  END IF;
END;
$$;
