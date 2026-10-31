-- Fix view security
alter view public.public_profiles set (security_invoker = true);

-- Fix the profiles primary key after verifying there are no duplicate ids and no referencing FKs
alter table public.profiles drop constraint if exists profiles_pkey;
alter table public.profiles add constraint profiles_pkey primary key (id);

-- Cover the foreign key used heavily by stream chat queries
create index if not exists stream_chat_stream_id_idx on public.stream_chat (stream_id);

-- Remove duplicate permissive policies and keep the stricter participant-aware policies
DROP POLICY IF EXISTS "insert signal" ON public.signals;
DROP POLICY IF EXISTS "read signal" ON public.signals;

-- Replace the broad ALL waiting policy + duplicates with one policy per action
DROP POLICY IF EXISTS "User manages own waiting slot" ON public.waiting_users;
DROP POLICY IF EXISTS "insert own" ON public.waiting_users;
DROP POLICY IF EXISTS "delete own" ON public.waiting_users;
CREATE POLICY "waiting_select_own" ON public.waiting_users FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "waiting_insert_own" ON public.waiting_users FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "waiting_update_own" ON public.waiting_users FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "waiting_delete_own" ON public.waiting_users FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- Optimize existing RLS policies by evaluating auth.uid() once per statement.
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (coalesce(qual,'') LIKE '%auth.uid()%' AND coalesce(qual,'') NOT LIKE '%select auth.uid()%')
        OR
        (coalesce(with_check,'') LIKE '%auth.uid()%' AND coalesce(with_check,'') NOT LIKE '%select auth.uid()%')
      )
  LOOP
    new_qual := CASE WHEN r.qual IS NULL THEN NULL ELSE replace(r.qual, 'auth.uid()', '(select auth.uid())') END;
    new_check := CASE WHEN r.with_check IS NULL THEN NULL ELSE replace(r.with_check, 'auth.uid()', '(select auth.uid())') END;

    IF r.cmd IN ('SELECT','DELETE') AND new_qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, new_qual);
    ELSIF r.cmd = 'INSERT' AND new_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, new_check);
    ELSIF r.cmd IN ('UPDATE','ALL') THEN
      IF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, new_qual, new_check);
      ELSIF new_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, new_qual);
      ELSIF new_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, new_check);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Fix top-up RPC: previous code wrote transaction type 'topup', which violates the table CHECK constraint.
CREATE OR REPLACE FUNCTION public.add_coins_safe(p_user_id uuid, p_amount integer, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_reference IS NULL OR btrim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = p_user_id
      AND type = 'buy'
      AND meta->>'reference' = p_reference
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_transaction');
  END IF;

  INSERT INTO public.users_coins (user_id, coins, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id)
  DO UPDATE SET coins = public.users_coins.coins + p_amount, updated_at = now();

  INSERT INTO public.transactions (user_id, type, amount, meta, created_at)
  VALUES (p_user_id, 'buy', p_amount, jsonb_build_object('reference', p_reference), now());

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Strict authentication for user-facing coin operations
CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus integer := 10;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO public.daily_bonus_claims (user_id, claimed_on) VALUES (p_user_id, CURRENT_DATE);
  INSERT INTO public.users_coins (user_id, coins) VALUES (p_user_id, v_bonus)
  ON CONFLICT (user_id) DO UPDATE SET coins = public.users_coins.coins + v_bonus, updated_at = NOW();
  INSERT INTO public.transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'bonus', v_bonus, '{"reason":"daily_login"}'::jsonb);
  RETURN jsonb_build_object('success', true, 'bonus', v_bonus);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_claimed_today');
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer, p_reason text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;
  SELECT coins INTO v_current FROM public.users_coins WHERE user_id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins', 'balance', v_current);
  END IF;
  UPDATE public.users_coins SET coins = coins - p_amount, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO public.transactions (user_id, type, amount, meta)
  VALUES (p_user_id, 'spend', -p_amount, COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_gift(p_sender_id uuid, p_receiver_id uuid, p_gift_type text, p_coins_cost integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_earned integer;
  v_gift_id uuid;
  v_deduct_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_coins_cost IS NULL OR p_coins_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_cost');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_gift_not_allowed');
  END IF;
  v_earned := FLOOR(p_coins_cost * 0.70);
  v_deduct_res := public.deduct_coins(p_sender_id, p_coins_cost, 'gift', jsonb_build_object('gift_type', p_gift_type, 'to', p_receiver_id));
  IF NOT coalesce((v_deduct_res->>'success')::boolean, false) THEN
    RETURN v_deduct_res;
  END IF;
  INSERT INTO public.users_coins (user_id, coins) VALUES (p_receiver_id, v_earned)
  ON CONFLICT (user_id) DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = NOW();
  INSERT INTO public.transactions (user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned, jsonb_build_object('gift_type', p_gift_type, 'from', p_sender_id));
  INSERT INTO public.gifts (sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, p_coins_cost, v_earned) RETURNING id INTO v_gift_id;
  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;

-- Harden stream gift RPC and require the receiver to be the active stream owner.
CREATE OR REPLACE FUNCTION public.send_gift_safe(p_stream_id uuid, p_receiver_id uuid, p_gift_type text, p_coin_cost integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_id uuid;
  v_sender_coins integer;
  v_stream_owner_id text;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF p_coin_cost IS NULL OR p_coin_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;
  IF v_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_gift_self');
  END IF;

  SELECT user_id INTO v_stream_owner_id
  FROM public.live_streams
  WHERE id = p_stream_id AND is_live = true;

  IF v_stream_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stream_not_live');
  END IF;
  IF p_receiver_id::text <> v_stream_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'receiver_not_stream_owner');
  END IF;

  SELECT coins INTO v_sender_coins
  FROM public.users_coins
  WHERE user_id = v_sender_id
  FOR UPDATE;

  IF v_sender_coins IS NULL OR v_sender_coins < p_coin_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;

  UPDATE public.users_coins
  SET coins = coins - p_coin_cost, updated_at = now()
  WHERE user_id = v_sender_id;

  INSERT INTO public.users_coins (user_id, coins)
  VALUES (p_receiver_id, p_coin_cost)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = public.users_coins.coins + p_coin_cost, updated_at = now();

  INSERT INTO public.gift_logs (sender_id, receiver_id, stream_id, gift_type, coin_cost)
  VALUES (v_sender_id, p_receiver_id, p_stream_id, p_gift_type, p_coin_cost);

  RETURN jsonb_build_object('success', true, 'error', null);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'database_error');
END;
$$;

-- Preserve both legacy send_stream_gift signatures, but make them call the hardened implementation.
CREATE OR REPLACE FUNCTION public.send_stream_gift(stream_id_input uuid, receiver_id_input uuid, gift_type_input text, coins_cost_input integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.send_gift_safe(stream_id_input, receiver_id_input, gift_type_input, coins_cost_input);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_stream_gift(target_stream_id uuid, gift_name text, gift_cost integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receiver text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT user_id INTO v_receiver FROM public.live_streams WHERE id = target_stream_id AND is_live = true;
  IF v_receiver IS NULL THEN
    RETURN false;
  END IF;
  v_result := public.send_gift_safe(target_stream_id, v_receiver::uuid, gift_name, gift_cost);
  RETURN coalesce((v_result->>'success')::boolean, false);
END;
$$;

-- Do not allow arbitrary large like increments or anonymous RPC calls.
CREATE OR REPLACE FUNCTION public.increment_stream_likes(target_stream_id uuid, increment_count integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF increment_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'increment_count must be 1';
  END IF;
  UPDATE public.live_streams
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = target_stream_id AND is_live = true;
END;
$$;

-- Lock down SECURITY DEFINER functions: revoke implicit/public execution, then explicitly grant intended API functions.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.atomic_match_or_wait(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ban_user_from_stream(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_waiting(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_coins(uuid,integer,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_stream_likes(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_gift(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_gift_safe(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_stream_heartbeat(uuid) TO authenticated;

-- add_coins_safe is a server-side/admin operation only.
GRANT EXECUTE ON FUNCTION public.add_coins_safe(uuid,integer,text) TO service_role;

-- Prevent future functions from becoming anonymously executable by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;