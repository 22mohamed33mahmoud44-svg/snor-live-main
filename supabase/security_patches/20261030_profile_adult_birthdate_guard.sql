-- Staged / REVIEW-ONLY age eligibility hardening for PR #16.
-- NOT an active Supabase migration; DO NOT apply to production before
-- migration-history reconciliation and a schema-compatible staging rehearsal.
--
-- The browser's age check is bypassable. This trigger validates user-supplied
-- dates even when writes arrive directly through the API or the writable view.
-- This verifies a claimed birth date, NOT a person's real-world age.
-- Existing legacy records are not rewritten; non-birthdate edits remain possible.
BEGIN;

DO $preflight$
DECLARE
  birthdate_type text;
BEGIN
  IF to_regclass('app_private.profiles') IS NULL THEN
    RAISE EXCEPTION 'Missing expected app_private.profiles source table';
  END IF;
  SELECT data_type INTO birthdate_type
  FROM information_schema.columns
  WHERE table_schema='app_private' AND table_name='profiles' AND column_name='birthdate';
  IF birthdate_type IS DISTINCT FROM 'date' THEN
    RAISE EXCEPTION 'Expected app_private.profiles.birthdate to be date, found %', birthdate_type;
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION app_private.require_adult_profile_birthdate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $age$
BEGIN
  IF NEW.birthdate IS NULL
     OR NEW.birthdate > (CURRENT_DATE - INTERVAL '18 years')::date THEN
    RAISE EXCEPTION 'Profile requires a valid birthdate for a user aged 18 or older'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$age$;

-- This internal trigger helper must not become a callable public RPC.
REVOKE ALL ON FUNCTION app_private.require_adult_profile_birthdate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_require_adult_birthdate ON app_private.profiles;
CREATE TRIGGER profiles_require_adult_birthdate
  BEFORE INSERT OR UPDATE OF birthdate ON app_private.profiles
  FOR EACH ROW
  EXECUTE FUNCTION app_private.require_adult_profile_birthdate();

COMMIT;
