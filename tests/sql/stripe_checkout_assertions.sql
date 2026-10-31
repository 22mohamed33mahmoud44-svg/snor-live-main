-- Simulate browser JWT roles, not just the postgres fixture owner.
-- A service-only wallet mint RPC must stay inaccessible after enabling 'buy'.
DO $wallet_privileges$
BEGIN
  IF has_function_privilege('anon','public.add_coins(uuid,integer,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.add_coins(uuid,integer,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles can mint coins directly';
  END IF;
  IF NOT has_function_privilege('service_role','public.add_coins(uuid,integer,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Stripe webhook service role cannot credit a validated checkout';
  END IF;
END;
$wallet_privileges$;

SET ROLE authenticated;
DO $browser_cannot_mint$
BEGIN
  BEGIN
    PERFORM public.add_coins(
      '11111111-1111-4111-8111-111111111111',99999,'{}'::jsonb
    );
    RAISE EXCEPTION 'Signed-in browser minted coins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.credit_stripe_checkout_event(
      'evt_fake_browser','checkout.session.completed',
      '11111111-1111-4111-8111-111111111111',100,'cs_fake_browser','pkg_100'
    );
    RAISE EXCEPTION 'Signed-in browser called Stripe webhook credit RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$browser_cannot_mint$;
RESET ROLE;

SET ROLE anon;
DO $anonymous_cannot_mint$
BEGIN
  BEGIN
    PERFORM public.add_coins(
      '11111111-1111-4111-8111-111111111111',99999,'{}'::jsonb
    );
    RAISE EXCEPTION 'Anonymous browser minted coins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$anonymous_cannot_mint$;
RESET ROLE;

DO $$
DECLARE
  buyer uuid := '11111111-1111-4111-8111-111111111111';
  unknown_buyer uuid := '22222222-2222-4222-8222-222222222222';
  credit_ok boolean;
  wallet integer;
  event_count integer;
  ledger_count integer;
BEGIN
  SELECT public.credit_stripe_checkout_event(
    'evt_first','checkout.session.completed',buyer,100,'cs_first','pkg_100'
  ) INTO credit_ok;
  IF credit_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'First payment not credited'; END IF;

  -- The same event cannot credit twice.
  SELECT public.credit_stripe_checkout_event(
    'evt_first','checkout.session.completed',buyer,100,'cs_first','pkg_100'
  ) INTO credit_ok;
  IF credit_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'Event replay credited again'; END IF;

  -- A different event ID for the same checkout session is still a duplicate.
  SELECT public.credit_stripe_checkout_event(
    'evt_other','checkout.session.completed',buyer,100,'cs_first','pkg_100'
  ) INTO credit_ok;
  IF credit_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'Duplicate checkout session credited again'; END IF;

  SELECT coins INTO wallet FROM public.users_coins WHERE user_id = buyer;
  SELECT count(*) INTO event_count FROM public.stripe_events;
  SELECT count(*) INTO ledger_count FROM public.transactions;
  -- The real production schema previously rejected type='buy'. Verify
  -- the migrated type constraint allows the exact checkout ledger entry.
  IF (SELECT count(*) FROM public.transactions
      WHERE user_id=buyer AND type='buy' AND amount=100
        AND meta->>'stripe_session_id'='cs_first') <> 1 THEN
    RAISE EXCEPTION 'Checkout completed without a valid buy ledger transaction';
  END IF;

  BEGIN
    INSERT INTO public.transactions(user_id,type,amount,meta)
    VALUES (buyer,'arbitrary-credit',100,'{}'::jsonb);
    RAISE EXCEPTION 'Unsupported wallet transaction type was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF wallet <> 100 OR event_count <> 1 OR ledger_count <> 1 THEN
    RAISE EXCEPTION 'Unexpected event or wallet balance after retries: %,%,%', wallet, event_count, ledger_count;
  END IF;

  -- Invalid package-to-amount pairs may never be credited.
  BEGIN
    PERFORM public.credit_stripe_checkout_event(
      'evt_bad', 'checkout.session.completed', buyer,1000,'cs_bad','pkg_100'
    );
    RAISE EXCEPTION 'Expected invalid package to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected invalid package to fail' THEN RAISE; END IF;
  END;

  -- A failure during add_coins must roll back the event insert, allowing retry.
  BEGIN
    PERFORM public.credit_stripe_checkout_event(
      'evt_retry','checkout.session.completed',unknown_buyer,500,'cs_retry','pkg_500'
    );
    RAISE EXCEPTION 'Expected missing user to fail';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM public.stripe_events WHERE stripe_event_id = 'evt_retry') THEN
    RAISE EXCEPTION 'A failed credit poisoned the idempotency ledger';
  END IF;

  SELECT public.credit_stripe_checkout_event(
    'evt_retry','checkout.session.completed',buyer,500,'cs_retry','pkg_500'
  ) INTO credit_ok;
  IF credit_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Valid retry could not credit'; END IF;

  SELECT coins INTO wallet FROM public.users_coins WHERE user_id = buyer;
  SELECT count(*) INTO event_count FROM public.stripe_events;
  SELECT count(*) INTO ledger_count FROM public.transactions;
  IF wallet <> 600 OR event_count <> 2 OR ledger_count <> 2 THEN
    RAISE EXCEPTION 'Stripe atomicity mismatch after retry: %,%,%', wallet,event_count,ledger_count;
  END IF;
END;
$$;
SELECT 'stripe checkout transaction tests passed' AS result;
