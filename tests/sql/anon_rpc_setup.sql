-- Isolated PostgreSQL 17 privilege regression fixture.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

-- Create stand-in functions for 27 privileged DEFINER RPCs and 1 INVOKER wrapper.
-- The production patch additionally checks SECURITY DEFINER and an auth.uid call.
DO $setup$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['apply_referral_code','boost_profile','check_show_access','claim_mission_reward','create_paid_show','deactivate_device_token','delete_message','end_paid_show','get_agent_dashboard','get_direct_messages','get_my_missions','get_my_vip','get_show_requirements','get_streamer_analytics','get_unread_count','join_via_agent','mark_messages_read','mark_notifications_read','register_as_agent','register_device_token','request_show_access','send_chat_message','send_direct_message','send_stream_gift','submit_report','subscribe_vip','update_last_seen','update_mission_progress']
  LOOP
    -- Migration _022 turns the public stream-gift wrapper into INVOKER;
    -- unlike the 27 other RPCs, it must not be part of _024's DEFINER scan.
    IF v_name = 'send_stream_gift' THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE FUNCTION public.%I() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN PERFORM auth.uid(); END; $fn
END;
$setup$;

-- This fixture represents the real state AFTER _022, not pre-migration
-- production. A SECURITY INVOKER wrapper remains usable for signed-in users.
CREATE FUNCTION public.send_stream_gift(
  p_stream_id uuid, p_receiver_id uuid, p_type text, p_price integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS
$ SELECT jsonb_build_object('success', false) $;
REVOKE EXECUTE ON FUNCTION public.send_stream_gift(uuid,uuid,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid,uuid,text,integer)
  TO authenticated;

CREATE FUNCTION public.get_gift_cost() RETURNS integer LANGUAGE sql STABLE
AS $ SELECT 10 $;
,
      v_name
    );
  END LOOP;
END;
$setup$;

CREATE FUNCTION public.get_gift_cost() RETURNS integer LANGUAGE sql STABLE
AS $$ SELECT 10 $$;
