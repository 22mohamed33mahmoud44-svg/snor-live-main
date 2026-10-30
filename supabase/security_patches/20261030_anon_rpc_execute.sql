-- Require signed-in API roles for user-specific privileged functions.
-- This is a reviewed forward security patch, NOT a production migration replay.
-- Check the current Supabase schema before applying.
--
-- Public read-only endpoints (search_profiles, get_gift_cost, get_app_config,
-- get_boosted_profiles, search_streams, is_user_online) are deliberately not
-- changed here. Trigger functions are also left alone.
DO $restrict_anonymous_privileged_functions$
DECLARE
  v_function record;
  v_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname = ANY (ARRAY[
    'apply_referral_code',
    'boost_profile',
    'check_show_access',
    'claim_mission_reward',
    'create_paid_show',
    'deactivate_device_token',
    'delete_message',
    'end_paid_show',
    'get_agent_dashboard',
    'get_direct_messages',
    'get_my_missions',
    'get_my_vip',
    'get_show_requirements',
    'get_streamer_analytics',
    'get_unread_count',
    'join_via_agent',
    'mark_messages_read',
    'mark_notifications_read',
    'register_as_agent',
    'register_device_token',
    'request_show_access',
    'send_chat_message',
    'send_direct_message',
    'send_stream_gift',
    'submit_report',
    'subscribe_vip',
    'update_last_seen',
    'update_mission_progress'
      ])
      AND p.prosecdef = true
      AND position('auth.uid()' in lower(pg_catalog.pg_get_functiondef(p.oid))) > 0
  LOOP
    -- A function otherwise executable through PUBLIC still permits anon calls
    -- even after removing direct anon grants, so revoke both entry points.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      v_function.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',
      v_function.oid::regprocedure);
    v_count := v_count + 1;
  END LOOP;

  -- Fail closed if production SQL has drifted from the signatures reviewed:
  -- the entire block, including earlier changes, will be rolled back.
  IF v_count <> 28 THEN
    RAISE EXCEPTION 'Expected to harden 28 user-only RPCs; found %. Re-audit function definitions before applying', v_count;
  END IF;
END;
$restrict_anonymous_privileged_functions$;
