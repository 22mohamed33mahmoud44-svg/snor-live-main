-- Isolated PostgreSQL 17 fixture; NEVER apply to production.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
GRANT USAGE ON SCHEMA auth, app_private TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE app_private.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL CHECK (char_length(btrim(username)) BETWEEN 1 AND 50),
  gender text NOT NULL,
  birthdate date NOT NULL,
  avatar_url text NOT NULL CHECK (char_length(avatar_url) <= 2048),
  hide_online boolean,
  show_in_radar boolean,
  full_name text,
  looking_for text,
  created_at timestamptz DEFAULT now(),
  followers_count integer DEFAULT 0,
  following_count integer DEFAULT 0,
  streams_count integer DEFAULT 0,
  coins_earned integer DEFAULT 0,
  referral_code text,
  referred_by uuid,
  streak_days integer DEFAULT 0,
  last_login_date date,
  last_seen_at timestamptz,
  search_vector tsvector
);

ALTER TABLE app_private.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner_select
  ON app_private.profiles FOR SELECT TO authenticated
  USING (auth.uid()=id);
CREATE POLICY profiles_owner_update
  ON app_private.profiles FOR UPDATE TO authenticated
  USING (auth.uid()=id) WITH CHECK (auth.uid()=id);

-- Original public views are created by a privileged role and fully writable.
CREATE VIEW public.profiles AS
SELECT id,username,full_name,gender,birthdate,looking_for,avatar_url,
       hide_online,show_in_radar,followers_count,following_count,
       streams_count,coins_earned,referral_code,streak_days,
       last_login_date,last_seen_at,created_at
FROM app_private.profiles;
CREATE VIEW public.public_profiles AS
SELECT id,username,full_name,avatar_url,gender FROM app_private.profiles;
GRANT ALL ON public.profiles TO authenticated, anon;
GRANT ALL ON public.public_profiles TO authenticated;

CREATE FUNCTION public.update_profiles_search_vector()
RETURNS trigger LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END; $$;

INSERT INTO app_private.profiles(id,username,full_name,gender,birthdate,avatar_url,coins_earned,referral_code)
VALUES
 ('11111111-1111-4111-8111-111111111111','alice','Alice','female','2001-01-01','',2000,'ALICECODE'),
 ('22222222-2222-4222-8222-222222222222','bob','Bob','male','1999-01-01','',9000,'BOBCODE');
