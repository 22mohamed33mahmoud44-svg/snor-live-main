-- Tests run only against the disposable fixture. Errors fail the CI job.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
DECLARE
  caller CONSTANT uuid := '11111111-1111-4111-8111-111111111111';
  receiver CONSTANT uuid := '22222222-2222-4222-8222-222222222222';
  stream CONSTANT uuid := '33333333-3333-4333-8333-333333333333';
  r jsonb;
  sender_balance integer;
  recipient_balance integer;
  gift_count integer;
  access_count integer;
BEGIN
  -- An arbitrary low client price must never be accepted.
  r := app_private.send_gift(caller, receiver, 'rose', 1);
  IF r->>'error' <> 'gift_price_changed' THEN RAISE EXCEPTION 'Direct gift underprice accepted: %', r; END IF;
  r := app_private.send_gift(caller, receiver, 'rose', 11);
  IF r->>'error' <> 'gift_price_changed' THEN RAISE EXCEPTION 'Direct gift overprice accepted: %', r; END IF;
  r := app_private.send_gift(caller, receiver, 'disabled', 5);
  IF r->>'error' <> 'gift_unavailable' THEN RAISE EXCEPTION 'Disabled gift accepted: %', r; END IF;

  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  IF sender_balance <> 100 THEN RAISE EXCEPTION 'Direct gift rejection changed balance'; END IF;

  r := app_private.send_gift(caller, receiver, 'rose', 10);
  IF r->>'success' <> 'true' THEN RAISE EXCEPTION 'Valid direct gift failed: %', r; END IF;
  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  SELECT coins INTO recipient_balance FROM public.users_coins WHERE user_id = receiver;
  IF sender_balance <> 90 OR recipient_balance <> 7 THEN
    RAISE EXCEPTION 'Direct gift accounting mismatch: %, %', sender_balance, recipient_balance;
  END IF;

  -- The live stream gift must have the canonical price and an actual live room owner.
  r := app_private.send_gift_safe(stream, receiver, 'rose', 2);
  IF r->>'error' <> 'gift_price_changed' THEN RAISE EXCEPTION 'Stream gift underprice accepted: %', r; END IF;
  r := app_private.send_gift_safe(stream, receiver, 'rose', 10);
  IF r->>'success' <> 'true' THEN RAISE EXCEPTION 'Valid stream gift failed: %', r; END IF;

  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  SELECT coins INTO recipient_balance FROM public.users_coins WHERE user_id = receiver;
  IF sender_balance <> 80 OR recipient_balance <> 14 THEN
    RAISE EXCEPTION 'Stream gift accounting mismatch: %, %', sender_balance, recipient_balance;
  END IF;

  -- A two-gift paid show with funds for only one must *never* debit anything.
  UPDATE public.users_coins SET coins = 15 WHERE user_id = caller;
  INSERT INTO public.paid_shows(id,streamer_id,required_gift_type,required_gift_count,is_active)
  VALUES ('44444444-4444-4444-8444-444444444444', receiver, 'rose', 2, true);

  SELECT count(*) INTO gift_count FROM public.gifts;
  r := public.request_show_access('44444444-4444-4444-8444-444444444444', 'rose');
  IF r->>'success' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Partially funded show purchase was accepted: %', r;
  END IF;
  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  IF sender_balance <> 15 THEN RAISE EXCEPTION 'PARTIAL DEBIT: first gift was not rolled back (%)', sender_balance; END IF;
  IF (SELECT count(*) FROM public.gifts) <> gift_count THEN
    RAISE EXCEPTION 'PARTIAL GIFT: gift rows were not rolled back';
  END IF;
  IF (SELECT count(*) FROM public.show_access) <> 0 THEN
    RAISE EXCEPTION 'Paid show access granted without full payment';
  END IF;

  -- After sufficient funding exactly two gifts and one access row are committed.
  UPDATE public.users_coins SET coins = 40 WHERE user_id = caller;
  r := public.request_show_access('44444444-4444-4444-8444-444444444444', 'rose');
  IF r->>'success' <> 'true' THEN RAISE EXCEPTION 'Paid-show purchase failed: %', r; END IF;
  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  IF sender_balance <> 20 THEN RAISE EXCEPTION 'Paid-show cost mismatch: %', sender_balance; END IF;
  SELECT count(*) INTO access_count FROM public.show_access;
  IF access_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one show access record'; END IF;
  IF (SELECT count(*) FROM public.gifts) <> gift_count + 2 THEN
    RAISE EXCEPTION 'Expected two paid-show gift records';
  END IF;

  -- Retrying should not charge the buyer again.
  r := public.request_show_access('44444444-4444-4444-8444-444444444444', 'rose');
  IF r->>'error' <> 'already_have_access' THEN RAISE EXCEPTION 'Duplicate paid-show access accepted: %', r; END IF;
  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = caller;
  IF sender_balance <> 20 THEN RAISE EXCEPTION 'Repeated paid-show purchase changed balance'; END IF;
END;
$$;

SELECT 'gift pricing and paid-show atomicity tests passed' AS result;
