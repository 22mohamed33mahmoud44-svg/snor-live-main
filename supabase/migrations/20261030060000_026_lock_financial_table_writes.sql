-- Defense in depth for the trusted money/coin ledger.
-- Live Supabase already has no browser write grants for these tables.
-- Make that contract explicit and remove an outdated gift-log INSERT policy
-- which would allow forged records if a future migration restored INSERT.
-- Apply ONLY after the production migration ledger is reconciled on staging.
--
-- Existing SELECT privileges/RLS and service_role's write access stay intact.
-- SECURITY DEFINER wallet/gift functions owned by postgres are not affected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE
    public.gift_logs,
    public.gifts,
    public.transactions,
    public.users_coins,
    public.stripe_events,
    public.gift_types
  FROM PUBLIC, anon, authenticated;

-- An authenticated user must not be able to forge gift logs even if
-- someone accidentally GRANTs INSERT again in the future.
ALTER TABLE public.gift_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gift_logs insert own" ON public.gift_logs;

DO $verify_financial_writes$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'gift_logs','gifts','transactions','users_coins','stripe_events','gift_types'
  ] LOOP
    IF pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       OR pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'Browser JWT role may directly mutate trusted financial table: %', v_table;
    END IF;
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'INSERT') THEN
      RAISE EXCEPTION 'Service role unexpectedly lost financial INSERT permission: %', v_table;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='gift_logs'
      AND cmd IN ('INSERT','ALL')
      AND ('authenticated' = ANY (roles) OR 'public' = ANY (roles))
  ) THEN
    RAISE EXCEPTION 'Gift logs still contain a browser INSERT RLS policy';
  END IF;
END;
$verify_financial_writes$;
