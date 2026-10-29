-- Require the server-side gift catalog price for both direct and stream gifts.
-- Preserve existing RPC signatures so older clients fail closed on stale prices.
CREATE OR REPLACE FUNCTION app_private.send_gift(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coins_cost integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_earned integer;
  v_gift_id uuid;
  v_deduct_res jsonb;
  v_price integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_receiver_id IS NULL OR p_gift_type IS NULL OR btrim(p_gift_type) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_gift');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_gift_not_allowed');
  END IF;

  SELECT coin_cost INTO v_price
  FROM public.gift_types
  WHERE code = p_gift_type AND is_active = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_unavailable');
  END IF;
  IF p_coins_cost IS DISTINCT FROM v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_price_changed');
  END IF;

  v_earned := floor(v_price * 0.70);
  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_too_small');
  END IF;

  v_deduct_res := app_private.deduct_coins(
    p_sender_id, v_price, 'gift',
    jsonb_build_object('gift_type', p_gift_type, 'to', p_receiver_id)
  );
  IF NOT coalesce((v_deduct_res->>'success')::boolean, false) THEN
    RETURN v_deduct_res;
  END IF;

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_receiver_id, v_earned, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned,
          jsonb_build_object('reason', 'gift', 'gift_type', p_gift_type,
                             'from', p_sender_id, 'gross_cost', v_price));

  INSERT INTO public.gifts(sender_id, receiver_id, gift_type, coins_cost, coins_earned)
  VALUES (p_sender_id, p_receiver_id, p_gift_type, v_price, v_earned)
  RETURNING id INTO v_gift_id;

  RETURN jsonb_build_object('success', true, 'gift_id', v_gift_id, 'coins_earned', v_earned);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.send_gift_safe(
  p_stream_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_coin_cost integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_stream_owner_id uuid;
  v_sender_coins integer;
  v_earned integer;
  v_price integer;
BEGIN
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF p_receiver_id IS NULL OR p_gift_type IS NULL OR btrim(p_gift_type) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_gift');
  END IF;
  IF v_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_gift_self');
  END IF;

  -- Source of truth: the active catalog, never the price sent by the browser.
  SELECT coin_cost INTO v_price
  FROM public.gift_types
  WHERE code = p_gift_type AND is_active = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_unavailable');
  END IF;
  IF p_coin_cost IS DISTINCT FROM v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_price_changed');
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

  IF v_sender_coins IS NULL OR v_sender_coins < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;

  v_earned := floor(v_price * 0.70);
  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'gift_too_small');
  END IF;

  UPDATE public.users_coins
  SET coins = coins - v_price, updated_at = now()
  WHERE user_id = v_sender_id;

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (v_sender_id, 'spend', -v_price,
          jsonb_build_object('reason', 'stream_gift', 'stream_id', p_stream_id,
                             'gift_type', p_gift_type, 'to', p_receiver_id));

  INSERT INTO public.users_coins(user_id, coins, updated_at)
  VALUES (p_receiver_id, v_earned, now())
  ON CONFLICT(user_id)
  DO UPDATE SET coins = public.users_coins.coins + v_earned, updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_receiver_id, 'earn', v_earned,
          jsonb_build_object('reason', 'stream_gift', 'stream_id', p_stream_id,
                             'gift_type', p_gift_type, 'from', v_sender_id,
                             'gross_cost', v_price));

  INSERT INTO public.gift_logs(sender_id, receiver_id, stream_id, gift_type, coin_cost)
  VALUES (v_sender_id, p_receiver_id, p_stream_id, p_gift_type, v_price);

  RETURN jsonb_build_object('success', true, 'coins_earned', v_earned, 'coins_spent', v_price);
END;
$$;

-- Paid-show access must use catalog-priced single gifts for bundles.
CREATE OR REPLACE FUNCTION public.request_show_access(p_show_id uuid, p_gift_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      v_viewer_id    UUID := auth.uid();
      v_show         paid_shows%ROWTYPE;
      v_gift_id      UUID;
      v_result       JSONB;
      v_gift_cost    INTEGER;
      v_purchase_count INTEGER;
    BEGIN
      IF v_viewer_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

      -- جلب بيانات البث الخاص
      SELECT * INTO v_show FROM paid_shows WHERE id = p_show_id AND is_active = true;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'show_not_found_or_ended');
      END IF;

      -- لا يمكن للمذيع نفسه شراء access
      IF v_viewer_id = v_show.streamer_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'streamer_has_access');
      END IF;

      -- التحقق أن نوع الهدية صحيح
      IF p_gift_type <> v_show.required_gift_type THEN
        RETURN jsonb_build_object('success', false, 'error', 'wrong_gift_type',
          'required', v_show.required_gift_type);
      END IF;

      -- التحقق من عدم الحصول على access مسبقاً
      IF EXISTS (SELECT 1 FROM show_access WHERE show_id = p_show_id AND user_id = v_viewer_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_have_access');
      END IF;

      -- التحقق من حد المشاهدين
      IF v_show.max_viewers IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM show_access WHERE show_id = p_show_id) >= v_show.max_viewers THEN
          RETURN jsonb_build_object('success', false, 'error', 'show_full');
        END IF;
      END IF;

      -- Resolve active catalog prices instead of hard-coded prices.
      SELECT coin_cost INTO v_gift_cost
      FROM public.gift_types
      WHERE code = p_gift_type AND is_active = true;
      IF v_gift_cost IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'gift_unavailable');
      END IF;

      IF v_show.required_gift_count > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_gift_count');
      END IF;

      -- Each gift uses the canonical single-item price. The whole function
      -- executes in one transaction, including the eventual access grant.
      FOR v_purchase_count IN 1..v_show.required_gift_count LOOP
        v_result := public.send_gift(
          v_viewer_id, v_show.streamer_id, p_gift_type, v_gift_cost
        );
        IF NOT coalesce((v_result->>'success')::boolean, false) THEN
          RETURN v_result;
        END IF;
        v_gift_id := (v_result->>'gift_id')::uuid;
      END LOOP;

      -- منح access
      INSERT INTO show_access (show_id, user_id, gift_id)
      VALUES (p_show_id, v_viewer_id, v_gift_id);

      -- إشعار المذيع
      INSERT INTO notifications (user_id, type, title, data)
      VALUES (v_show.streamer_id, 'gift', '🎭 مشاهد جديد دخل البث الخاص!',
        jsonb_build_object('viewer_id', v_viewer_id, 'gift_type', p_gift_type, 'show_id', p_show_id));

      RETURN jsonb_build_object(
        'success', true, 'access_granted', true,
        'show_id', p_show_id, 'gift_type', p_gift_type
      );
    END;
    $function$;
