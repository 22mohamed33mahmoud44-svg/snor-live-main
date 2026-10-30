-- ONLY for a disposable PostgreSQL 17 fixture after the existing
-- profile-privacy setup and migration, BEFORE the staged age patch.
-- Simulates an existing legacy account that might already be underage.
INSERT INTO app_private.profiles
  (id,username,gender,birthdate,avatar_url,looking_for)
VALUES
  ('55555555-5555-4555-8555-555555555555','legacy_user','female',
   (CURRENT_DATE - INTERVAL '17 years')::date,'','male');
