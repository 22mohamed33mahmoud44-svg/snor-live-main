-- Age gate assertions on disposable PostgreSQL 17; no real user data.
DO $verify$
DECLARE
  v_eligible date := (CURRENT_DATE - INTERVAL '18 years')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='app_private.profiles'::regclass
      AND tgname='profiles_require_adult_birthdate'
      AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'Adult age trigger missing or disabled';
  END IF;
  IF has_function_privilege('authenticated',
      'app_private.require_adult_profile_birthdate()', 'EXECUTE')
     OR has_function_privilege('anon',
      'app_private.require_adult_profile_birthdate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles can call the private trigger helper';
  END IF;

  -- Even a privileged direct base-table write cannot introduce underage rows.
  BEGIN
    INSERT INTO app_private.profiles(id, username,gender,birthdate,avatar_url)
    VALUES ('66666666-6666-4666-8666-666666666666','young','female',v_eligible+1,'');
    RAISE EXCEPTION 'Underage direct INSERT bypassed age guard';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$verify$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $user_checks$
DECLARE
  v_eligible date := (CURRENT_DATE - INTERVAL '18 years')::date;
  v_id uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  -- The existing owner-scoped writable view routes through the base trigger.
  BEGIN
    UPDATE public.profiles SET birthdate = v_eligible + 1 WHERE id = v_id;
    RAISE EXCEPTION 'Underage UPDATE through view succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.profiles SET birthdate = v_eligible WHERE id=v_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id=v_id AND birthdate=v_eligible) THEN
    RAISE EXCEPTION 'Adult on exact birthday should be accepted';
  END IF;
END;
$user_checks$;

-- A new eligible profile can still be created through the owner view.
SELECT set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',false);
INSERT INTO public.profiles(id,username,gender,birthdate,avatar_url)
VALUES ('77777777-7777-4777-8777-777777777777','adult_new','female',
        (CURRENT_DATE - INTERVAL '18 years')::date,'');
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
-- Legacy record: edits to other columns should not be blocked or erased.
UPDATE public.profiles SET full_name='Legacy User' WHERE id='55555555-5555-4555-8555-555555555555';
DO $legacy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles
                WHERE id='55555555-5555-4555-8555-555555555555'
                  AND full_name='Legacy User') THEN
   RAISE EXCEPTION 'Unrelated legacy profile edit was unexpectedly blocked';
 END IF;
END;
$legacy$;
RESET ROLE;
SELECT 'adult birthdate guard on underlying profiles and owner view verified' AS result;
