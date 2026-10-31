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

-- Mirror the production signals table's active-match-only INSERT policy and
-- cleanup trigger, which previously made post-end signals impossible to send.
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id),
  sender uuid NOT NULL,
  type text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY signals_insert_participant ON public.signals
FOR INSERT TO authenticated
WITH CHECK (
  sender=auth.uid() AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id=match_id AND m.status='active'
      AND auth.uid() IN (m.user1,m.user2)
  )
);
CREATE POLICY signals_select_participant ON public.signals
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.matches m WHERE m.id=match_id
    AND auth.uid() IN (m.user1,m.user2)
));
GRANT SELECT,INSERT ON public.signals TO authenticated;

CREATE FUNCTION app_private.cleanup_ended_match_signals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog'
AS $cleanup$
BEGIN
  IF NEW.status='ended' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.signals WHERE match_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$cleanup$;

CREATE TRIGGER cleanup_signals_on_match_end
AFTER UPDATE OF status ON public.matches
FOR EACH ROW WHEN (NEW.status='ended' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION app_private.cleanup_ended_match_signals();


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
