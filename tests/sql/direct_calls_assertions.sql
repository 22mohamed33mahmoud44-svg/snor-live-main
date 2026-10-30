-- Verify RLS and explicit recipient consent with real PostgreSQL policies.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  v_call uuid;
  v_status text;
  v_type text;
BEGIN
  -- The original INSERT policy would allow these two waiting users to create
  -- arbitrary room records. The replacement must reject direct INSERT.
  BEGIN
    INSERT INTO public.matches(user1,user2,kind,status)
    VALUES(alice,bob,'direct','active');
    RAISE EXCEPTION 'Forged active direct call accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.matches(user1,user2,kind,status)
    VALUES(alice,bob,'direct','pending');
    RAISE EXCEPTION 'Forged pending direct call accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Reject unknown call types before creating an invitation.
  BEGIN
    PERFORM public.create_direct_call(bob, 'unsupported');
    RAISE EXCEPTION 'Invalid call type accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Invalid call type accepted' THEN RAISE; END IF;
  END;

  v_call := public.create_direct_call(bob, 'audio');
  IF v_call IS NULL THEN RAISE EXCEPTION 'Invitation was not created'; END IF;

  SELECT status INTO v_status FROM public.matches WHERE id=v_call;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Direct invitation not pending'; END IF;
  SELECT call_type INTO v_type FROM public.matches WHERE id=v_call;
  IF v_type <> 'audio' THEN RAISE EXCEPTION 'Audio invitation type was lost: %', v_type; END IF;

  IF public.respond_direct_call(v_call,true) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Caller accepted their own invitation';
  END IF;

  -- Pending -> active is not permitted by client UPDATE; only the verified RPC.
  BEGIN
    UPDATE public.matches SET status='active' WHERE id=v_call;
    RAISE EXCEPTION 'Client upgraded pending invitation to active';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('test.current_call', v_call::text, false);
END;
$$;

-- Unrelated users cannot read or accept another person's invitation.
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $$
DECLARE
  call_id uuid := current_setting('test.current_call')::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.matches WHERE id=call_id) THEN
    RAISE EXCEPTION 'Non-participant can read a direct invitation';
  END IF;
  IF public.respond_direct_call(call_id,true) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Non-participant accepted a direct invitation';
  END IF;

  -- The browser must not treat an unauthorized 0-row UPDATE as success.
  UPDATE public.matches SET status='ended'
  WHERE id=call_id AND status='active';
  IF FOUND THEN
    RAISE EXCEPTION 'Unrelated caller changed another users call status';
  END IF;
END;
$$;

-- Recipient consent activates the room; no second activation.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$
DECLARE
  call_id uuid := current_setting('test.current_call')::uuid;
  v_status text;
BEGIN
  IF public.respond_direct_call(call_id,true) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Recipient could not accept invitation';
  END IF;
  SELECT status INTO v_status FROM public.matches WHERE id=call_id;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Accepted invitation is not active'; END IF;
  IF public.respond_direct_call(call_id,true) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Repeated acceptance unexpectedly succeeded';
  END IF;

  -- Signals are allowed only during the active call.
  INSERT INTO public.signals(match_id,sender,type,data)
  VALUES (call_id, auth.uid(), 'test', '{}'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.signals WHERE match_id=call_id) THEN
    RAISE EXCEPTION 'Active call signal failed';
  END IF;

  -- A participant ends the call by updating the authoritative matches row.
  UPDATE public.matches SET status='ended' WHERE id=call_id;
  SELECT status INTO v_status FROM public.matches WHERE id=call_id;
  IF v_status <> 'ended' THEN RAISE EXCEPTION 'Participant could not end call'; END IF;

  -- Production deletes signals when status becomes ended.
  IF EXISTS (SELECT 1 FROM public.signals WHERE match_id=call_id) THEN
    RAISE EXCEPTION 'Match-ending trigger did not clean up signals';
  END IF;

  -- Match-ending is idempotent: a second UPDATE with status='active'
  -- returns zero rows and the client must verify status='ended' separately.
  UPDATE public.matches SET status='ended'
  WHERE id=call_id AND status='active';
  IF FOUND THEN
    RAISE EXCEPTION 'Already ended call matched a second active UPDATE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id=call_id AND status='ended') THEN
    RAISE EXCEPTION 'Already ended call could not be verified';
  END IF;

  -- This used to be the broken client flow: INSERT end signal after the
  -- UPDATE. Verify production RLS rejects the insert.
  BEGIN
    INSERT INTO public.signals(match_id,sender,type,data)
    VALUES (call_id, auth.uid(), 'end', '{}'::jsonb);
    RAISE EXCEPTION 'Post-end signal unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- Caller may cancel a still-pending call; recipient cannot accept afterward.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $cancel_pending$
DECLARE
  call_id uuid;
  state text;
BEGIN
  call_id := public.create_direct_call(
    '22222222-2222-4222-8222-222222222222', 'video'
  );
  UPDATE public.matches SET status='ended'
  WHERE id=call_id AND status IN ('pending','active');
  SELECT status INTO state FROM public.matches WHERE id=call_id;
  IF state <> 'ended' THEN RAISE EXCEPTION 'Caller failed to cancel pending call'; END IF;
  PERFORM set_config('test.cancelled_invite',call_id::text,false);
END;
$cancel_pending$;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $reject_late_acceptance$
BEGIN
  IF public.respond_direct_call(current_setting('test.cancelled_invite')::uuid,true)
    IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Recipient accepted a cancelled call';
  END IF;
END;
$reject_late_acceptance$;

-- Simulate a race: recipient accepted while caller still shows "waiting".
-- Caller cancel must end both pending AND newly active matches.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $start_race$
DECLARE call_id uuid;
BEGIN
  call_id := public.create_direct_call(
    '22222222-2222-4222-8222-222222222222','audio');
  PERFORM set_config('test.accepted_before_cancel',call_id::text,false);
END;
$start_race$;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $accept_race$
BEGIN
  IF NOT public.respond_direct_call(
    current_setting('test.accepted_before_cancel')::uuid,true) THEN
    RAISE EXCEPTION 'Race invitation acceptance failed';
  END IF;
END;
$accept_race$;

SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $cancel_race$
DECLARE state text;
BEGIN
  UPDATE public.matches SET status='ended'
  WHERE id=current_setting('test.accepted_before_cancel')::uuid
    AND status IN ('pending','active');
  SELECT status INTO state FROM public.matches
  WHERE id=current_setting('test.accepted_before_cancel')::uuid;
  IF state <> 'ended' THEN
    RAISE EXCEPTION 'Caller left an accepted call active after cancel';
  END IF;
END;
$cancel_race$;

RESET ROLE;
SELECT 'direct-call consent, cancellation race and signal RLS tests passed' AS result;
