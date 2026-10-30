-- Cross-feature test against a *single* temporary PostgreSQL database,
-- with actual Stripe and gift migrations applied together.
SELECT set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);

DO $integration$
DECLARE
  buyer uuid := '11111111-1111-4111-8111-111111111111';
  streamer uuid := '22222222-2222-4222-8222-222222222222';
  stream uuid := '33333333-3333-4333-8333-333333333333';
  paid_show uuid := '44444444-4444-4444-8444-444444444444';
  unknown uuid := '55555555-5555-4555-8555-555555555555';
  result jsonb;
  credited boolean;
  sender_balance integer;
  receiver_balance integer;
  ledger_sum bigint;
  ledger_count integer;
BEGIN
  -- Existing balance = 100. Stripe buys another 500.
  credited := public.credit_stripe_checkout_event(
    'evt_wallet_1','checkout.session.completed',buyer,500,'cs_wallet_1','pkg_500');
  IF credited IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Verified checkout did not credit';
  END IF;

  -- Replayed event and a distinct event for the same checkout session
  -- cannot mint coins twice.
  credited := public.credit_stripe_checkout_event(
    'evt_wallet_1','checkout.session.completed',buyer,500,'cs_wallet_1','pkg_500');
  IF credited IS DISTINCT FROM false THEN RAISE EXCEPTION 'Event replay credited'; END IF;
  credited := public.credit_stripe_checkout_event(
    'evt_wallet_2','checkout.session.completed',buyer,500,'cs_wallet_1','pkg_500');
  IF credited IS DISTINCT FROM false THEN RAISE EXCEPTION 'Session replay credited'; END IF;

  -- Rejected gift prices must not affect the freshly credited wallet.
  result := app_private.send_gift(buyer, streamer, 'rose', 1);
  IF result->>'error' <> 'gift_price_changed' THEN
    RAISE EXCEPTION 'Underpriced gift accepted: %', result;
  END IF;

  result := app_private.send_gift(buyer, streamer, 'rose', 10);
  IF result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Purchased coins cannot fund a direct gift: %', result;
  END IF;
  result := app_private.send_gift_safe(stream, streamer, 'heart', 25);
  IF result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Purchased coins cannot fund a stream gift: %', result;
  END IF;

  INSERT INTO public.paid_shows (
    id, streamer_id, required_gift_type, required_gift_count, is_active
  ) VALUES (paid_show, streamer, 'rose', 2, true);

  result := public.request_show_access(paid_show, 'rose');
  IF result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Purchased coins cannot open a paid show: %', result;
  END IF;

  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id = buyer;
  SELECT coins INTO receiver_balance FROM public.users_coins WHERE user_id = streamer;

  -- Buyer: 100 + 500 - 10 - 25 - 20 = 545
  -- Streamer: 7 + 17 + 14 = 38 (70% of each gift)
  IF sender_balance <> 545 OR receiver_balance <> 38 THEN
    RAISE EXCEPTION 'Cross-feature coin mismatch: buyer %, streamer %',
      sender_balance, receiver_balance;
  END IF;

  SELECT COALESCE(SUM(amount), 0), count(*)
  INTO ledger_sum, ledger_count FROM public.transactions;
  IF ledger_sum <> 500 - 10 + 7 - 25 + 17 - 20 + 14
     OR ledger_count <> 9 THEN
    RAISE EXCEPTION 'Ledger mismatch: sum %, rows %', ledger_sum, ledger_count;
  END IF;

  IF (SELECT count(*) FROM public.gifts) <> 3
     OR (SELECT count(*) FROM public.gift_logs) <> 1
     OR (SELECT count(*) FROM public.show_access) <> 1
     OR (SELECT count(*) FROM public.stripe_events) <> 1 THEN
    RAISE EXCEPTION 'Expected gift, stream, paid-show and Stripe records missing';
  END IF;

  -- A failed Stripe credit must not poison the event ledger or adjust wallets.
  BEGIN
    PERFORM public.credit_stripe_checkout_event(
      'evt_bad_receiver','checkout.session.completed',
      unknown,100,'cs_bad_receiver','pkg_100');
    RAISE EXCEPTION 'Missing-user checkout unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.stripe_events
    WHERE stripe_event_id = 'evt_bad_receiver'
  ) THEN
    RAISE EXCEPTION 'Failed Stripe credit left an event record';
  END IF;

  SELECT coins INTO sender_balance FROM public.users_coins WHERE user_id=buyer;
  IF sender_balance <> 545 THEN
    RAISE EXCEPTION 'Failed checkout affected existing wallet';
  END IF;
END;
$integration$;

SELECT 'shared Stripe + gift wallet ledger: cross-feature assertions passed' AS result;
