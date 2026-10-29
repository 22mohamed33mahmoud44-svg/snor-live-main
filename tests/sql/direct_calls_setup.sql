-- Disposable PostgreSQL 17 fixture for direct-call authorization. Never production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.waiting_users (user_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  message text NOT NULL DEFAULT ''
);
CREATE TABLE public.blocked_users (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  UNIQUE(blocker_id,blocked_id)
);
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1 uuid REFERENCES auth.users(id),
  user2 uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_status_check CHECK (status IN ('active','ended')),
  CONSTRAINT matches_active_participants_check CHECK (status <> 'active' OR (user1 IS NOT NULL AND user2 IS NOT NULL AND user1 <> user2))
);

CREATE FUNCTION app_private.can_create_direct_match(p_user1 uuid,p_user2 uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'pg_catalog' AS $$
  SELECT auth.uid() IS NOT NULL AND p_user1 IS NOT NULL
    AND p_user2 IS NOT NULL AND p_user1 <> p_user2
    AND auth.uid() IN (p_user1,p_user2)
    AND EXISTS (SELECT 1 FROM public.waiting_users w
                WHERE w.user_id=p_user1 AND w.created_at > now()-interval '5 minutes')
    AND EXISTS (SELECT 1 FROM public.waiting_users w
                WHERE w.user_id=p_user2 AND w.created_at > now()-interval '5 minutes')
$$;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matches_insert_waiting_pair ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_create_direct_match(user1,user2));
CREATE POLICY "Users see own matches" ON public.matches
  FOR SELECT TO authenticated
  USING (auth.uid() = user1 OR auth.uid() = user2);
CREATE POLICY "matches update participant authenticated" ON public.matches
  FOR UPDATE TO authenticated
  USING (auth.uid() = user1 OR auth.uid() = user2)
  WITH CHECK ((auth.uid() = user1 OR auth.uid() = user2) AND status IN ('active','ended'));

GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT,INSERT ON public.matches TO authenticated;
GRANT UPDATE(status) ON public.matches TO authenticated;

INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');

INSERT INTO public.waiting_users(user_id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.messages(sender_id,receiver_id,message) VALUES
 ('11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', 'hello');
