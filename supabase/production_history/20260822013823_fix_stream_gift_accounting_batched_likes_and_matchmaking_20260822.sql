-- Stream gift accounting must match the canonical 70% earning rule.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.gift_logs FROM anon, authenticated;
DROP POLICY IF EXISTS "gift_logs insert own" ON public.gift_logs;

CREATE OR REPLACE FUNCTION public.send_gift_safe(
  p_stream_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coin_cost integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  VALUES (
    v_sender_id,
    'spend',
    -p_coin_cost,
    jsonb_build_object('reason','stream_gift','stream_id',p_stream_id,'gift_type',p_gift_type,'to',p_receiver_id)
  );

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_receiver_id, v_earned, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (
    p_receiver_id,
    'earn',
    v_earned,
    jsonb_build_object('reason','stream_gift','stream_id',p_stream_id,'gift_type',p_gift_type,'from',v_sender_id,'gross_cost',p_coin_cost)
  );

  INSERT INTO public.gift_logs(sender_id, receiver_id, stream_id, gift_type, coin_cost)
  VALUES (v_sender_id, p_receiver_id, p_stream_id, p_gift_type, p_coin_cost);

  RETURN jsonb_build_object('success', true, 'coins_earned', v_earned, 'coins_spent', p_coin_cost);
END;
$$;

-- Preserve intentional batched-like behavior while bounding a single RPC call.
CREATE OR REPLACE FUNCTION public.increment_stream_likes(
  target_stream_id uuid,
  increment_count integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF increment_count IS NULL OR increment_count < 1 OR increment_count > 100 THEN
    RAISE EXCEPTION 'increment_count must be between 1 and 100';
  END IF;

  UPDATE public.live_streams
  SET likes_count = COALESCE(likes_count, 0) + increment_count
  WHERE id = target_stream_id AND is_live = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stream not live';
  END IF;
END;
$$;

-- Serialize matchmaking operations so a user cannot be paired twice by concurrent calls.
CREATE OR REPLACE FUNCTION public.atomic_match_or_wait(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Data invariants.
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check CHECK (status IN ('active','ended'));
ALTER TABLE public.live_streams DROP CONSTRAINT IF EXISTS live_streams_counts_nonnegative;
ALTER TABLE public.live_streams ADD CONSTRAINT live_streams_counts_nonnegative CHECK (likes_count >= 0 AND viewers_count >= 0);
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_coin_values_valid;
ALTER TABLE public.gifts ADD CONSTRAINT gifts_coin_values_valid CHECK (coins_cost > 0 AND coins_earned >= 0 AND coins_earned <= coins_cost);
ALTER TABLE public.gift_logs DROP CONSTRAINT IF EXISTS gift_logs_coin_cost_positive;
ALTER TABLE public.gift_logs ADD CONSTRAINT gift_logs_coin_cost_positive CHECK (coin_cost > 0);
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_direction_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_direction_check CHECK (
  (type = 'spend' AND amount < 0)
  OR (type IN ('buy','earn','bonus','refund') AND amount > 0)
);