/*
# Migration 012: Phase 6 — Messages Unification & Direct Messaging
# =================================================================
# 1. Unify public.messages + public.private_messages into one table
#    - Add: type ('match' | 'direct'), receiver_id, deleted_at
#    - Migrate: all private_messages rows → messages with type='direct'
#    - Indexes: direct inbox, sender, soft-delete
#
# 2. New RPCs:
#    - get_direct_messages()  — paginated DM thread between two users
#    - send_direct_message()  — send DM with block check + notification
#    - mark_messages_read()   — mark thread as read
#    - delete_message()       — soft delete own message
#
# After this migration, public.private_messages is kept as-is (legacy)
# but all new DMs should use public.messages with type='direct'.
*/

-- ── 1. Extend messages table ──
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'match'
  CHECK (type IN ('match','direct'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── 2. Migrate private_messages → messages ──
INSERT INTO public.messages (id, sender_id, receiver_id, message, read, created_at, type)
SELECT id, sender_id, receiver_id, message, read, created_at, 'direct'
FROM public.private_messages
ON CONFLICT (id) DO NOTHING;

-- ── 3. Indexes ──
CREATE INDEX IF NOT EXISTS idx_messages_direct  ON public.messages(receiver_id, created_at DESC) WHERE type = 'direct';
CREATE INDEX IF NOT EXISTS idx_messages_sender  ON public.messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON public.messages(deleted_at) WHERE deleted_at IS NOT NULL;

-- ── 4. get_direct_messages() ──
CREATE OR REPLACE FUNCTION public.get_direct_messages(
  p_other_user_id UUID,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (id UUID, sender_id UUID, receiver_id UUID, message TEXT, read BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.read, m.created_at
    FROM messages m
    WHERE m.type = 'direct' AND m.deleted_at IS NULL
      AND ((m.sender_id = v_me AND m.receiver_id = p_other_user_id)
        OR (m.sender_id = p_other_user_id AND m.receiver_id = v_me))
    ORDER BY m.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_direct_messages(UUID, INT, INT) TO authenticated;

-- ── 5. send_direct_message() ──
CREATE OR REPLACE FUNCTION public.send_direct_message(p_receiver_id UUID, p_message TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sender_id UUID := auth.uid(); v_msg_id UUID;
BEGIN
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_receiver_id = v_sender_id THEN RETURN jsonb_build_object('success',false,'error','cannot_message_self'); END IF;
  IF length(trim(p_message)) = 0 THEN RETURN jsonb_build_object('success',false,'error','empty_message'); END IF;
  IF length(p_message) > 1000 THEN RETURN jsonb_build_object('success',false,'error','message_too_long'); END IF;
  IF EXISTS (SELECT 1 FROM blocked_users WHERE
      (blocker_id = p_receiver_id AND blocked_id = v_sender_id) OR
      (blocker_id = v_sender_id AND blocked_id = p_receiver_id)) THEN
    RETURN jsonb_build_object('success',false,'error','user_blocked');
  END IF;
  INSERT INTO messages (sender_id, receiver_id, message, type)
  VALUES (v_sender_id, p_receiver_id, trim(p_message), 'direct')
  RETURNING id INTO v_msg_id;
  INSERT INTO notifications (user_id, type, title, data)
  VALUES (p_receiver_id, 'message', 'رسالة جديدة', jsonb_build_object('from',v_sender_id,'message_id',v_msg_id));
  RETURN jsonb_build_object('success',true,'message_id',v_msg_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.send_direct_message(UUID, TEXT) TO authenticated;

-- ── 6. mark_messages_read() ──
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_sender_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE messages SET read = true
  WHERE type = 'direct' AND receiver_id = auth.uid()
    AND sender_id = p_sender_id AND read = false;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID) TO authenticated;

-- ── 7. delete_message() ──
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE messages SET deleted_at = NOW()
  WHERE id = p_message_id AND sender_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','not_found_or_unauthorized'); END IF;
  RETURN jsonb_build_object('success',true);
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_message(UUID) TO authenticated;
