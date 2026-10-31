-- Remove dangerous broad write/admin-like grants from anonymous clients across public tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon', r.tablename);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated', r.tablename);
  END LOOP;
END $$;

-- blocked_users: authenticated users can read/create/delete only their own blocks; no updates.
DROP POLICY IF EXISTS "users can manage their own blocks" ON public.blocked_users;
CREATE POLICY "blocked_users_select_own" ON public.blocked_users
FOR SELECT TO authenticated
USING ((select auth.uid()) = blocker_id);
CREATE POLICY "blocked_users_insert_own" ON public.blocked_users
FOR INSERT TO authenticated
WITH CHECK (
  blocker_id = (select auth.uid())
  AND blocked_id IS NOT NULL
  AND blocked_id <> (select auth.uid())
);
CREATE POLICY "blocked_users_delete_own" ON public.blocked_users
FOR DELETE TO authenticated
USING ((select auth.uid()) = blocker_id);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
REVOKE UPDATE ON public.blocked_users FROM authenticated;

-- follows: public read is allowed; only signed-in users create/delete their own follows.
ALTER POLICY "follows_select" ON public.follows TO anon, authenticated;
ALTER POLICY "follows_insert_own" ON public.follows TO authenticated
  WITH CHECK (
    follower_id = (select auth.uid())
    AND following_id IS NOT NULL
    AND following_id <> (select auth.uid())
  );
ALTER POLICY "follows_delete_own" ON public.follows TO authenticated
  USING (follower_id = (select auth.uid()));
GRANT SELECT ON public.follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.follows TO authenticated;
REVOKE UPDATE ON public.follows FROM authenticated;

-- gift logs are written only by trusted gift RPCs; clients may only read their own records.
DROP POLICY IF EXISTS "gift_logs insert own" ON public.gift_logs;
ALTER POLICY "gift_logs read own" ON public.gift_logs TO authenticated
  USING ((select auth.uid()) = sender_id OR (select auth.uid()) = receiver_id);
REVOKE ALL ON public.gift_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gift_logs FROM authenticated;
GRANT SELECT ON public.gift_logs TO authenticated;

-- Remaining tables: grant only the operations actually supported by their RLS policies.
REVOKE ALL ON public.waiting_users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_users TO authenticated;

REVOKE ALL ON public.matches FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
REVOKE DELETE ON public.matches FROM authenticated;

REVOKE ALL ON public.signals FROM anon;
GRANT SELECT, INSERT ON public.signals TO authenticated;
REVOKE UPDATE, DELETE ON public.signals FROM authenticated;

REVOKE ALL ON public.users_coins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.users_coins FROM authenticated;
GRANT SELECT ON public.users_coins TO authenticated;

REVOKE ALL ON public.transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
GRANT SELECT ON public.transactions TO authenticated;

REVOKE ALL ON public.gifts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gifts FROM authenticated;
GRANT SELECT ON public.gifts TO authenticated;

REVOKE ALL ON public.vip_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.vip_subscriptions FROM authenticated;
GRANT SELECT ON public.vip_subscriptions TO authenticated;

REVOKE ALL ON public.daily_bonus_claims FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.daily_bonus_claims FROM authenticated;
GRANT SELECT ON public.daily_bonus_claims TO authenticated;