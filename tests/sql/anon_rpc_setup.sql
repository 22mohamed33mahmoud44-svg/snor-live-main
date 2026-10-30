-- Isolated PostgreSQL 17 privilege regression fixture.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

-- Create stand-in functions for the exact 28 privileged RPC names.
-- The production patch additionally checks SECURITY DEFINER and an auth.uid call.
DO $setup$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['apply_referral_code','boost_profile','check_show_access','claim_mission_reward','create_paid_show','deactivate_device_token','delete_message','end_paid_show','get_agent_dashboard','get_direct_messages','get_my_missions','get_my_vip','get_show_requirements','get_streamer_analytics','get_unread_count','join_via_agent','mark_messages_read','mark_notifications_read','register_as_agent','register_device_token','request_show_access','send_chat_message','send_direct_message','send_stream_gift','submit_report','subscribe_vip','update_last_seen','update_mission_progress']
  LOOP
    EXECUTE format(
      'CREATE FUNCTION public.%I() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN PERFORM auth.uid(); END; $fn$',
      v_name
    );
  END LOOP;
END;
$setup$;

CREATE FUNCTION public.get_gift_cost() RETURNS integer LANGUAGE sql STABLE
AS $$ SELECT 10 $$;
