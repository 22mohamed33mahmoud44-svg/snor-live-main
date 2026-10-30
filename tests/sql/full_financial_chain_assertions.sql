-- Real sequential _020, _022, _024, _026 integration regression.
-- Run after combined_wallet_assertions.sql in a disposable PostgreSQL 17 DB.
DO $verify_release_chain$
DECLARE
  v_rpc_count integer;
  v_name text;
BEGIN
  SELECT count(*) INTO v_rpc_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND p.proname IN (
      'apply_referral_code','boost_profile','check_show_access',
      'claim_mission_reward','create_paid_show','deactivate_device_token',
      'delete_message','end_paid_show','get_agent_dashboard','get_direct_messages',
      'get_my_missions','get_my_vip','get_show_requirements',
      'get_streamer_analytics','get_unread_count','join_via_agent',
      'mark_messages_read','mark_notifications_read','register_as_agent',
      'register_device_token','request_show_access','send_chat_message',
      'send_direct_message','submit_report','subscribe_vip',
      'update_last_seen','update_mission_progress'
    ) AND position('auth.uid()' IN lower(pg_get_functiondef(p.oid))) > 0;
  IF v_rpc_count <> 27 THEN
    RAISE EXCEPTION 'Expected 27 privileged RPCs after _022 and _024, got %', v_rpc_count;
  END IF;

  IF has_function_privilege('anon',
       'public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
       'public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
       'public.add_coins(uuid,integer,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Stripe credit RPC authorization regressed in full migration chain';
  END IF;

  IF has_function_privilege('anon',
       'public.request_show_access(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.request_show_access(uuid,text)','EXECUTE')
     OR has_function_privilege('anon',
       'public.send_stream_gift(uuid,uuid,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.send_stream_gift(uuid,uuid,text,integer)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Gift and paid-show privileges regressed after _024';
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
      'gift_logs','gifts','transactions','users_coins','stripe_events','gift_types'
  ] LOOP
    IF has_table_privilege('authenticated','public.'||v_name,'INSERT')
       OR has_table_privilege('authenticated','public.'||v_name,'UPDATE')
       OR has_table_privilege('authenticated','public.'||v_name,'DELETE')
       OR has_table_privilege('anon','public.'||v_name,'INSERT')
       OR has_table_privilege('anon','public.'||v_name,'UPDATE')
       OR has_table_privilege('anon','public.'||v_name,'DELETE') THEN
      RAISE EXCEPTION 'Financial table % grants browser writes',v_name;
    END IF;
  END LOOP;
END;
$verify_release_chain$;

-- Deliberately regrant a vulnerable right and prove RLS still rejects
-- a forged log row. The RPC-backed legitimate gift path remains usable.
GRANT INSERT ON public.gift_logs TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);

DO $forgery_and_legitimate_gift$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    INSERT INTO public.gift_logs(sender_id,receiver_id,stream_id,gift_type,coin_cost)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333', 'rose', 99999
    );
    RAISE EXCEPTION 'Forged gift log accepted with INSERT grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  v_result := public.send_stream_gift(
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'rose',10
  );
  IF v_result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Valid stream gift failed after financial lock: %',v_result;
  END IF;
END;
$forgery_and_legitimate_gift$;
RESET ROLE;
REVOKE INSERT ON public.gift_logs FROM authenticated;

DO $final_wallet_state$
DECLARE
  buyer_coins integer;
  receiver_coins integer;
BEGIN
  SELECT coins INTO buyer_coins FROM public.users_coins
    WHERE user_id='11111111-1111-4111-8111-111111111111';
  SELECT coins INTO receiver_coins FROM public.users_coins
    WHERE user_id='22222222-2222-4222-8222-222222222222';
  IF buyer_coins<>535 OR receiver_coins<>45 THEN
    RAISE EXCEPTION 'Expected 535/45 after Stripe-paid gifts and extra RPC gift, got %/%',
      buyer_coins,receiver_coins;
  END IF;
  IF (SELECT count(*) FROM public.stripe_events)<>1
     OR (SELECT count(*) FROM public.gift_logs)<>2
     OR (SELECT count(*) FROM public.gifts)<>3
     OR (SELECT count(*) FROM public.show_access)<>1 THEN
    RAISE EXCEPTION 'Duplicate Stripe credit, forged gift or wrong access count';
  END IF;
END;
$final_wallet_state$;

SELECT 'Four real migrations with shared Stripe/gift/RPC ledger passed' AS result;
