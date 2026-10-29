-- Run with real database roles; errors make the CI job fail.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE
 alice uuid := '11111111-1111-4111-8111-111111111111';
 bob uuid := '22222222-2222-4222-8222-222222222222';
 v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.public_profiles;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Public discovery not readable for both users: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Private profile view exposes other users: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.profiles WHERE id=bob;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Other users profile details visible'; END IF;

  -- The other user's birthdate must not be reachable via direct base-table access.
  BEGIN
    PERFORM birthdate FROM app_private.profiles WHERE id=bob;
    RAISE EXCEPTION 'Sensitive base-table column unexpectedly readable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- The publicly visible discovery projection must not be writable.
  BEGIN
    UPDATE public.public_profiles SET username='hacked' WHERE id=bob;
    RAISE EXCEPTION 'Public discovery view unexpectedly writable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.profiles SET username='hacked' WHERE id=bob;
  IF FOUND THEN RAISE EXCEPTION 'Other users profile was modified'; END IF;

  BEGIN
    UPDATE public.profiles SET coins_earned=999999 WHERE id=alice;
    RAISE EXCEPTION 'Financial profile counters unexpectedly writable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- A malicious signed-in client cannot insert another user's profile.
  BEGIN
    INSERT INTO public.profiles(id,username) VALUES
      ('33333333-3333-4333-8333-333333333333','forged');
    RAISE EXCEPTION 'Profile INSERT check bypassed';
  EXCEPTION
    WHEN with_check_option_violation THEN NULL;
  END;

  UPDATE public.profiles SET username='alice_renamed' WHERE id=alice;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id=alice AND username='alice_renamed') THEN
    RAISE EXCEPTION 'Owner profile update denied';
  END IF;
END;
$$;

RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.profiles;
    RAISE EXCEPTION 'Anonymous private profiles are readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM id FROM public.public_profiles;
    RAISE EXCEPTION 'Anonymous discovery is readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
SELECT 'profile view owner access and safe public projection verified' AS result;
