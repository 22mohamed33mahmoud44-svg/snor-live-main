-- Disposable PostgreSQL 17, run only after gift_prices_setup.sql.
-- Reproduce the production _pre-022_ 28 user-specific SECURITY DEFINER RPCs:
-- 26 unchanged mocks + the actual old-signature gift and paid-show wrappers.
DO $setup_cross_migration$
DECLARE
  v_name text;
  v_expected integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'apply_referral_code','boost_profile','check_show_access',
    'claim_mission_reward','create_paid_show','deactivate_device_token',
    'delete_message','end_paid_show','get_agent_dashboard',
    'get_direct_messages','get_my_missions','get_my_vip',
    'get_show_requirements','get_streamer_analytics','get_unread_count',
    'join_via_agent','mark_messages_read','mark_notifications_read',
    'register_as_agent','register_device_token',
    'send_chat_message','send_direct_message','submit_report',
    'subscribe_vip','update_last_seen','update_mission_progress'
  ]
  LOOP
    EXECUTE format(
      'CREATE FUNCTION public.%I() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN PERFORM auth.uid(); END; $fn$',
      v_name
    );
  END LOOP;
END;
$setup_cross_migration$;

CREATE FUNCTION public.send_stream_gift(
  p_stream_id uuid, p_receiver_id uuid, p_gift_type text, p_coin_cost integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
AS $old_stream$
BEGIN
  RETURN jsonb_build_object('caller', auth.uid());
END;
$old_stream$;

CREATE FUNCTION public.request_show_access(
  p_show_id uuid, p_gift_type text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
AS $$ SELECT jsonb_build_object('caller', auth.uid()) $$;

DO $predecessor_count$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND position('auth.uid()' IN lower(pg_get_functiondef(p.oid)))>0;
  IF v_count <> 28 THEN
    RAISE EXCEPTION 'Pre-_022 fixture must model 28 privileged DEFINER RPCs, got %',v_count;
  END IF;
END;
$predecessor_count$;
