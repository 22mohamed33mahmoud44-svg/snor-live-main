/*
# Migration 006: Sync Repo with Live Database
# =============================================
# Objects that exist in the DB but were missing from repo migrations.
#
# New Tables:
#   1. public.blocked_users   — user block relationships
#   2. public.gift_logs       — gift event log per stream
#   3. public.private_messages — direct private messages
#
# New Functions:
#   1. end_match()            — atomically end an active match
#   2. is_user_banned()       — check if user is banned from a stream
#   3. rls_auto_enable()      — event trigger to auto-enable RLS on new tables
#   4. send_stream_gift()     — send a gift within a live stream context
*/

-- ── Table: public.blocked_users ──
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- ── Table: public.gift_logs ──
CREATE TABLE IF NOT EXISTS public.gift_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  stream_id uuid NOT NULL,
  gift_type text NOT NULL,
  coin_cost integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.gift_logs ENABLE ROW LEVEL SECURITY;

-- ── Table: public.private_messages ──
CREATE TABLE IF NOT EXISTS public.private_messages (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX blocked_users_blocked_id_idx ON public.blocked_users USING btree (blocked_id);
CREATE UNIQUE INDEX blocked_users_pkey ON public.blocked_users USING btree (id);
CREATE UNIQUE INDEX blocked_users_blocker_id_blocked_id_key ON public.blocked_users USING btree (blocker_id, blocked_id);
CREATE UNIQUE INDEX gift_logs_pkey ON public.gift_logs USING btree (id);
CREATE INDEX gift_logs_sender_id_idx ON public.gift_logs USING btree (sender_id);
CREATE INDEX gift_logs_receiver_id_idx ON public.gift_logs USING btree (receiver_id);
CREATE INDEX gift_logs_stream_id_idx ON public.gift_logs USING btree (stream_id);
CREATE UNIQUE INDEX private_messages_pkey ON public.private_messages USING btree (id);
CREATE INDEX pm_conversation_idx ON public.private_messages USING btree (sender_id, receiver_id, created_at);
CREATE INDEX private_messages_receiver_id_idx ON public.private_messages USING btree (receiver_id);

-- ── Function: public.end_match ──
CREATE OR REPLACE FUNCTION public.end_match(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE v_match public.matches%ROWTYPE; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF; SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','match_not_found'); END IF; IF auth.uid() IS DISTINCT FROM v_match.user1 AND auth.uid() IS DISTINCT FROM v_match.user2 THEN RAISE EXCEPTION 'not authorized'; END IF; IF v_match.status <> 'active' THEN RETURN jsonb_build_object('success',true,'status',v_match.status); END IF; UPDATE public.matches SET status='ended' WHERE id=p_match_id; RETURN jsonb_build_object('success',true,'status','ended','match_id',p_match_id); END; $function$
;

-- ── Function: public.is_user_banned ──
CREATE OR REPLACE FUNCTION public.is_user_banned(p_stream_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$ SELECT app_private.is_user_banned(p_stream_id,p_user_id); $function$
;

-- ── Function: public.rls_auto_enable ──
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- ── Function: public.send_stream_gift ──
CREATE OR REPLACE FUNCTION public.send_stream_gift(target_stream_id uuid, gift_name text, gift_cost integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_receiver uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT user_id INTO v_receiver FROM public.live_streams WHERE id=target_stream_id AND is_live=true;
  IF v_receiver IS NULL THEN RETURN false; END IF;
  v_result := app_private.send_gift_safe(target_stream_id,v_receiver,gift_name,gift_cost);
  RETURN coalesce((v_result->>'success')::boolean,false);
END;
$function$
;

-- ── Function: public.send_stream_gift ──
CREATE OR REPLACE FUNCTION public.send_stream_gift(stream_id_input uuid, receiver_id_input uuid, gift_type_input text, coins_cost_input integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ SELECT app_private.send_gift_safe(stream_id_input,receiver_id_input,gift_type_input,coins_cost_input); $function$
;

