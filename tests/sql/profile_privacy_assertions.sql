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
    INSERT INTO public.profiles(id,username,gender,birthdate,avatar_url) VALUES
      ('33333333-3333-4333-8333-333333333333','forged','male',DATE '2000-01-01','');
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

-- Mirror the frontend's new save flow: first INSERT then owner UPDATE.
-- Using a view UPsert (INSERT .. ON CONFLICT) is deliberately avoided.
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $new_profile$
DECLARE
  my_id uuid := '44444444-4444-4444-8444-444444444444';
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = my_id) THEN
    RAISE EXCEPTION 'New profile unexpectedly exists';
  END IF;

  -- Production avatar_url is NOT NULL even though the onboarding
  -- photograph is optional. The frontend must send the empty string.
  BEGIN
    INSERT INTO public.profiles (id, username, gender, birthdate)
    VALUES (my_id, 'new_user', 'female', DATE '2000-01-02');
    RAISE EXCEPTION 'Incomplete profile without avatar_url passed NOT NULL constraint';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;

  INSERT INTO public.profiles (id, username, gender, birthdate, avatar_url)
  VALUES (my_id, 'user_44444444444444448444444444444444', 'female', DATE '2000-01-02', '');

  UPDATE public.profiles SET full_name='New User' WHERE id=my_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id=my_id AND username='user_44444444444444448444444444444444'
      AND full_name='New User' AND avatar_url=''
  ) THEN
    RAISE EXCEPTION 'New owner INSERT/UPDATE flow failed';
  END IF;

  BEGIN
    UPDATE public.profiles SET username='bad_edit' WHERE id =
      '11111111-1111-4111-8111-111111111111';
    IF FOUND THEN RAISE EXCEPTION 'Could edit another owner'; END IF;
  END;
END;
$new_profile$;

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
