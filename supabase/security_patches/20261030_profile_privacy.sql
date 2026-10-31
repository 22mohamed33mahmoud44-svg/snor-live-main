-- Profile privacy hardening against the deployed app_private.profiles schema.
-- Review on an isolated database before executing in production: migration histories differ.
--
-- Public profile discovery is limited to five non-sensitive columns.
-- The authenticated "profiles" view is owner-scoped and writable only for
-- explicitly editable fields. Do not expose birth dates, referral data, or
-- accounting counters through the public discovery view.

ALTER TABLE app_private.profiles ENABLE ROW LEVEL SECURITY;

-- PUBLIC discovery view needs only the five columns it exposes. Column-level
-- grants avoid granting callers access to sensitive base-table fields.
GRANT SELECT (id, username, full_name, avatar_url, gender)
  ON app_private.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_public_discovery_select" ON app_private.profiles;
CREATE POLICY "profiles_public_discovery_select"
  ON app_private.profiles
  FOR SELECT TO authenticated
  USING (true);

-- PostgreSQL 17: use caller's column grants + RLS for the discovery view.
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- The discovery view is never an update endpoint.
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;

-- Preserve the existing columns and their order to avoid breaking queries.
-- Ownership restriction is evaluated using the caller's JWT identity even
-- though this existing writable view runs with the view owner's privileges.
CREATE OR REPLACE VIEW public.profiles AS
SELECT
  id,
  username,
  full_name,
  gender,
  birthdate,
  looking_for,
  avatar_url,
  hide_online,
  show_in_radar,
  followers_count,
  following_count,
  streams_count,
  coins_earned,
  referral_code,
  streak_days,
  last_login_date,
  last_seen_at,
  created_at
FROM app_private.profiles
WHERE id = (SELECT auth.uid())
WITH CASCADED CHECK OPTION;

-- No anonymous reader should see private profile attributes.
REVOKE ALL ON public.profiles FROM PUBLIC, anon;

-- Avoid allowing account holders to write balances, follow counters, or
-- accumulated earnings via the still-updatable owner profile view.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, username, full_name, gender, birthdate, looking_for,
              avatar_url, hide_online, show_in_radar)
  ON public.profiles TO authenticated;
GRANT UPDATE (username, full_name, gender, birthdate, looking_for,
              avatar_url, hide_online, show_in_radar)
  ON public.profiles TO authenticated;

-- An unrelated linter finding: pin this trigger helper's search path.
ALTER FUNCTION public.update_profiles_search_vector()
  SET search_path = pg_catalog, public;
