CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.atomic_match_or_wait(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
DECLARE
  v_other uuid;
  v_match public.matches%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM pg_advisory_xact_lock(726674643243086313::bigint);

  SELECT * INTO v_match
  FROM public.matches
  WHERE status = 'active' AND (user1 = p_user_id OR user2 = p_user_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM public.waiting_users WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status','matched','match',to_jsonb(v_match));
  END IF;

  DELETE FROM public.waiting_users WHERE created_at < now() - interval '5 minutes';
  DELETE FROM public.waiting_users WHERE user_id = p_user_id;

  SELECT w.user_id INTO v_other
  FROM public.waiting_users w
  WHERE w.user_id <> p_user_id
    AND w.created_at >= now() - interval '5 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.status = 'active' AND (m.user1 = w.user_id OR m.user2 = w.user_id)
    )
  ORDER BY w.created_at ASC NULLS FIRST
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_other IS NULL THEN
    INSERT INTO public.waiting_users(user_id, created_at)
    VALUES (p_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET created_at = EXCLUDED.created_at;
    RETURN jsonb_build_object('status','waiting');
  END IF;

  DELETE FROM public.waiting_users WHERE user_id IN (p_user_id, v_other);

  INSERT INTO public.matches(user1, user2, status, created_at)
  VALUES (least(p_user_id, v_other), greatest(p_user_id, v_other), 'active', now())
  RETURNING * INTO v_match;

  RETURN jsonb_build_object('status','matched','match',to_jsonb(v_match));
END;
$$;

CREATE OR REPLACE FUNCTION app_private.claim_daily_bonus(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
DECLARE v_bonus integer := 10;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.daily_bonus_claims(user_id, claimed_on)
  VALUES (p_user_id, CURRENT_DATE);

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_user_id, v_bonus, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_bonus, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_user_id, 'bonus', v_bonus, jsonb_build_object('reason','daily_login'));

  RETURN jsonb_build_object('success', true, 'bonus', v_bonus);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_claimed_today');
END;
$$;

CREATE OR REPLACE FUNCTION app_private.deduct_coins(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
DECLARE v_current integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  SELECT coins INTO v_current
  FROM public.users_coins
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins', 'balance', v_current);
  END IF;

  UPDATE public.users_coins
  SET coins = coins - p_amount, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (
    p_user_id,
    'spend',
    -p_amount,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('reason', coalesce(nullif(btrim(p_reason),''),'unspecified'))
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.increment_stream_likes(
  target_stream_id uuid,
  increment_count integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF increment_count IS NULL OR increment_count < 1 OR increment_count > 100 THEN
    RAISE EXCEPTION 'increment_count must be between 1 and 100';
  END IF;

  UPDATE public.live_streams
  SET likes_count = coalesce(likes_count, 0) + increment_count
  WHERE id = target_stream_id AND is_live = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stream not live';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_user_banned(p_stream_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stream_bans
    WHERE stream_id = p_stream_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.send_gift(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coins_cost integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
DECLARE
  v_earned integer;
  v_gift_id uuid;
  v_deduct_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_receiver_id IS NULL OR p_gift_type IS NULL OR btrim(p_gift_type) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_gift');
  END IF;
  IF p_coins_cost IS NULL OR p_coins_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_cost');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_gift_not_allowed');
  END IF;

  v_earned := floor(p_coins_cost * 0.70);
  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_too_small');
  END IF;

  v_deduct_res := app_private.deduct_coins(
    p_sender_id,
    p_coins_cost,
    'gift',
    jsonb_build_object('gift_type',p_gift_type,'to',p_receiver_id)
  );
  IF NOT coalesce((v_deduct_res->>'success')::boolean, false) THEN
    RETURN v_deduct_res;
  END IF;

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_receiver_id, v_earned, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned, jsonb_build_object('reason','gift','gift_type',p_gift_type,'from',p_sender_id,'gross_cost',p_coins_cost));

  INSERT INTO public.gifts(sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, p_coins_cost, v_earned)
  RETURNING id INTO v_gift_id;

  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.send_gift_safe(
  p_stream_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coin_cost integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_stream_owner_id uuid;
  v_sender_coins integer;
  v_earned integer;
BEGIN
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF p_receiver_id IS NULL OR p_gift_type IS NULL OR btrim(p_gift_type) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_gift');
  END IF;
  IF p_coin_cost IS NULL OR p_coin_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;
  IF v_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_gift_self');
  END IF;

  SELECT user_id INTO v_stream_owner_id
  FROM public.live_streams
  WHERE id = p_stream_id AND is_live = true
  FOR SHARE;

  IF v_stream_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stream_not_live');
  END IF;
  IF p_receiver_id <> v_stream_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'receiver_not_stream_owner');
  END IF;

  SELECT coins INTO v_sender_coins
  FROM public.users_coins
  WHERE user_id = v_sender_id
  FOR UPDATE;

  IF v_sender_coins IS NULL OR v_sender_coins < p_coin_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;

  v_earned := floor(p_coin_cost * 0.70);
  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_too_small');
  END IF;

  UPDATE public.users_coins
  SET coins = coins - p_coin_cost, updated_at = now()
  WHERE user_id = v_sender_id;

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (v_sender_id, 'spend', -p_coin_cost, jsonb_build_object('reason','stream_gift','stream_id',p_stream_id,'gift_type',p_gift_type,'to',p_receiver_id));

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_receiver_id, v_earned, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned, jsonb_build_object('reason','stream_gift','stream_id',p_stream_id,'gift_type',p_gift_type,'from',v_sender_id,'gross_cost',p_coin_cost));

  INSERT INTO public.gift_logs(sender_id, receiver_id, stream_id, gift_type, coin_cost)
  VALUES (v_sender_id, p_receiver_id, p_stream_id, p_gift_type, p_coin_cost);

  RETURN jsonb_build_object('success', true, 'coins_earned', v_earned, 'coins_spent', p_coin_cost);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.atomic_match_or_wait(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_daily_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.deduct_coins(uuid,integer,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.increment_stream_likes(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_user_banned(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.send_gift(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.send_gift_safe(uuid,uuid,text,integer) TO authenticated;

-- Keep the public API signatures, but remove direct SECURITY DEFINER exposure.
CREATE OR REPLACE FUNCTION public.atomic_match_or_wait(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.atomic_match_or_wait(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.claim_daily_bonus(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer, p_reason text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.deduct_coins(p_user_id,p_amount,p_reason,p_meta); $$;

CREATE OR REPLACE FUNCTION public.increment_stream_likes(target_stream_id uuid, increment_count integer DEFAULT 1)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.increment_stream_likes(target_stream_id,increment_count); $$;

CREATE OR REPLACE FUNCTION public.is_user_banned(p_stream_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.is_user_banned(p_stream_id,p_user_id); $$;

CREATE OR REPLACE FUNCTION public.send_gift(p_sender_id uuid, p_receiver_id uuid, p_gift_type text, p_coins_cost integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.send_gift(p_sender_id,p_receiver_id,p_gift_type,p_coins_cost); $$;

CREATE OR REPLACE FUNCTION public.send_gift_safe(p_stream_id uuid, p_receiver_id uuid, p_gift_type text, p_coin_cost integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.send_gift_safe(p_stream_id,p_receiver_id,p_gift_type,p_coin_cost); $$;

CREATE OR REPLACE FUNCTION public.send_stream_gift(stream_id_input uuid, receiver_id_input uuid, gift_type_input text, coins_cost_input integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog
AS $$ SELECT app_private.send_gift_safe(stream_id_input,receiver_id_input,gift_type_input,coins_cost_input); $$;

CREATE OR REPLACE FUNCTION public.send_stream_gift(target_stream_id uuid, gift_name text, gift_cost integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog
AS $$
DECLARE v_receiver uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT user_id INTO v_receiver FROM public.live_streams WHERE id=target_stream_id AND is_live=true;
  IF v_receiver IS NULL THEN RETURN false; END IF;
  v_result := app_private.send_gift_safe(target_stream_id,v_receiver,gift_name,gift_cost);
  RETURN coalesce((v_result->>'success')::boolean,false);
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_match_or_wait(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_daily_bonus(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deduct_coins(uuid,integer,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_stream_likes(uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_banned(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_gift(uuid,uuid,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_gift_safe(uuid,uuid,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_stream_gift(uuid,uuid,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_stream_gift(uuid,text,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.atomic_match_or_wait(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_coins(uuid,integer,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_stream_likes(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_gift(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_gift_safe(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid,text,integer) TO authenticated;