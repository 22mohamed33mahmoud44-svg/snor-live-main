-- Remove policies that depend on columns whose types are changing.
DROP POLICY IF EXISTS "live_streams_owner_delete" ON public.live_streams;
DROP POLICY IF EXISTS "live_streams_owner_insert" ON public.live_streams;
DROP POLICY IF EXISTS "live_streams_owner_update" ON public.live_streams;
DROP POLICY IF EXISTS "chat_insert_own" ON public.stream_chat;
DROP POLICY IF EXISTS "messages_insert_participant" ON public.messages;
DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;
DROP POLICY IF EXISTS "messages_update_read_receiver" ON public.messages;
DROP POLICY IF EXISTS "bans_delete_streamer" ON public.stream_bans;
DROP POLICY IF EXISTS "bans_insert_streamer" ON public.stream_bans;
DROP POLICY IF EXISTS "bans_select_streamer" ON public.stream_bans;

-- Clean stale profile rows that no longer have an Auth user.
DELETE FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Preserve historical matches while removing dangling user references.
UPDATE public.matches m
SET user1 = NULL
WHERE user1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user1);
UPDATE public.matches m
SET user2 = NULL
WHERE user2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user2);

-- Normalize identity/reference types.
ALTER TABLE public.live_streams
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE public.stream_chat
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE public.messages
  ALTER COLUMN match_id TYPE uuid USING match_id::uuid,
  ALTER COLUMN sender_id TYPE uuid USING sender_id::uuid;

-- Referential integrity.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.live_streams
  DROP CONSTRAINT IF EXISTS live_streams_user_id_fkey,
  ADD CONSTRAINT live_streams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stream_chat
  DROP CONSTRAINT IF EXISTS stream_chat_user_id_fkey,
  ADD CONSTRAINT stream_chat_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_user1_fkey,
  DROP CONSTRAINT IF EXISTS matches_user2_fkey,
  ADD CONSTRAINT matches_user1_fkey FOREIGN KEY (user1) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT matches_user2_fkey FOREIGN KEY (user2) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_match_id_fkey,
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  ADD CONSTRAINT messages_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE,
  ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Recreate stream ownership policies using UUID equality.
CREATE POLICY "live_streams_owner_delete" ON public.live_streams
FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "live_streams_owner_insert" ON public.live_streams
FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "live_streams_owner_update" ON public.live_streams
FOR UPDATE TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- Public can read live streams; only authenticated owners mutate.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.live_streams FROM anon;
GRANT SELECT ON public.live_streams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_streams TO authenticated;

-- Stream bans: only authenticated stream owner can inspect/manage bans.
CREATE POLICY "bans_select_streamer" ON public.stream_bans
FOR SELECT TO authenticated
USING ((select auth.uid()) = (SELECT l.user_id FROM public.live_streams l WHERE l.id = stream_bans.stream_id));
CREATE POLICY "bans_insert_streamer" ON public.stream_bans
FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) = (SELECT l.user_id FROM public.live_streams l WHERE l.id = stream_bans.stream_id)
  AND banned_by = (select auth.uid())
  AND user_id <> (select auth.uid())
);
CREATE POLICY "bans_delete_streamer" ON public.stream_bans
FOR DELETE TO authenticated
USING ((select auth.uid()) = (SELECT l.user_id FROM public.live_streams l WHERE l.id = stream_bans.stream_id));
REVOKE ALL ON public.stream_bans FROM anon;
GRANT SELECT, INSERT, DELETE ON public.stream_bans TO authenticated;

-- Stream chat: public read, authenticated self-authored insert, no client-side update/delete.
CREATE POLICY "chat_insert_own" ON public.stream_chat
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND NOT public.is_user_banned(stream_id, (select auth.uid()))
);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.stream_chat FROM anon;
GRANT SELECT ON public.stream_chat TO anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.stream_chat FROM authenticated;
GRANT SELECT, INSERT ON public.stream_chat TO authenticated;

-- Match-scoped messages.
CREATE POLICY "messages_select_match_participant" ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = messages.match_id
      AND ((select auth.uid()) = m.user1 OR (select auth.uid()) = m.user2)
  )
);
CREATE POLICY "messages_insert_match_participant" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = messages.match_id
      AND ((select auth.uid()) = m.user1 OR (select auth.uid()) = m.user2)
      AND m.status = 'active'
  )
);
REVOKE ALL ON public.messages FROM anon;
REVOKE DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.messages FROM authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;

-- Direct messages: least privilege.
DROP POLICY IF EXISTS "users can see their messages" ON public.private_messages;
CREATE POLICY "private_messages_select_participant" ON public.private_messages
FOR SELECT TO authenticated
USING ((select auth.uid()) = sender_id OR (select auth.uid()) = receiver_id);
CREATE POLICY "private_messages_insert_sender" ON public.private_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (select auth.uid())
  AND receiver_id IS NOT NULL
  AND receiver_id <> (select auth.uid())
);
CREATE POLICY "private_messages_update_read_receiver" ON public.private_messages
FOR UPDATE TO authenticated
USING (receiver_id = (select auth.uid()))
WITH CHECK (receiver_id = (select auth.uid()));
REVOKE ALL ON public.private_messages FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.private_messages FROM authenticated;
GRANT SELECT, INSERT ON public.private_messages TO authenticated;
GRANT UPDATE (read) ON public.private_messages TO authenticated;

-- Conversations helper now reads direct-message table.
CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS TABLE(partner_id uuid, last_message text, last_time timestamp with time zone, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT
    CASE WHEN m.sender_id = p_user_id THEN m.receiver_id ELSE m.sender_id END,
    (array_agg(m.message ORDER BY m.created_at DESC))[1],
    max(m.created_at),
    count(*) FILTER (WHERE m.receiver_id = p_user_id AND m.read = false)
  FROM public.private_messages m
  WHERE m.sender_id = p_user_id OR m.receiver_id = p_user_id
  GROUP BY CASE WHEN m.sender_id = p_user_id THEN m.receiver_id ELSE m.sender_id END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_conversations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;

-- UUID-correct stream helper functions.
CREATE OR REPLACE FUNCTION public.ban_user_from_stream(p_stream_id uuid, p_user_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_streamer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'unauthenticated'); END IF;
  SELECT user_id INTO v_streamer_id FROM public.live_streams WHERE id=p_stream_id AND is_live=true;
  IF v_streamer_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'stream_not_found'); END IF;
  IF auth.uid() <> v_streamer_id THEN RETURN jsonb_build_object('success', false, 'error', 'not_authorized'); END IF;
  IF auth.uid() = p_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'cannot_ban_self'); END IF;
  INSERT INTO public.stream_bans(stream_id,user_id,banned_by,reason)
  VALUES(p_stream_id,p_user_id,auth.uid(),p_reason)
  ON CONFLICT(stream_id,user_id) DO NOTHING;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(p_stream_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.live_streams SET last_heartbeat_at=now()
  WHERE id=p_stream_id AND user_id=auth.uid() AND is_live=true;
END; $$;

CREATE OR REPLACE FUNCTION public.send_gift_safe(p_stream_id uuid, p_receiver_id uuid, p_gift_type text, p_coin_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_sender_id uuid; v_sender_coins integer; v_stream_owner_id uuid;
BEGIN
  v_sender_id:=auth.uid();
  IF v_sender_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;
  IF p_coin_cost IS NULL OR p_coin_cost<=0 THEN RETURN jsonb_build_object('success',false,'error','invalid_amount'); END IF;
  IF v_sender_id=p_receiver_id THEN RETURN jsonb_build_object('success',false,'error','cannot_gift_self'); END IF;
  SELECT user_id INTO v_stream_owner_id FROM public.live_streams WHERE id=p_stream_id AND is_live=true;
  IF v_stream_owner_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','stream_not_live'); END IF;
  IF p_receiver_id<>v_stream_owner_id THEN RETURN jsonb_build_object('success',false,'error','receiver_not_stream_owner'); END IF;
  SELECT coins INTO v_sender_coins FROM public.users_coins WHERE user_id=v_sender_id FOR UPDATE;
  IF v_sender_coins IS NULL OR v_sender_coins<p_coin_cost THEN RETURN jsonb_build_object('success',false,'error','insufficient_coins'); END IF;
  UPDATE public.users_coins SET coins=coins-p_coin_cost,updated_at=now() WHERE user_id=v_sender_id;
  INSERT INTO public.users_coins(user_id,coins) VALUES(p_receiver_id,p_coin_cost)
  ON CONFLICT(user_id) DO UPDATE SET coins=public.users_coins.coins+p_coin_cost,updated_at=now();
  INSERT INTO public.gift_logs(sender_id,receiver_id,stream_id,gift_type,coin_cost)
  VALUES(v_sender_id,p_receiver_id,p_stream_id,p_gift_type,p_coin_cost);
  RETURN jsonb_build_object('success',true,'error',null);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error','database_error');
END; $$;

CREATE OR REPLACE FUNCTION public.send_stream_gift(target_stream_id uuid, gift_name text, gift_cost integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_receiver uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT user_id INTO v_receiver FROM public.live_streams WHERE id=target_stream_id AND is_live=true;
  IF v_receiver IS NULL THEN RETURN false; END IF;
  v_result:=public.send_gift_safe(target_stream_id,v_receiver,gift_name,gift_cost);
  RETURN coalesce((v_result->>'success')::boolean,false);
END; $$;