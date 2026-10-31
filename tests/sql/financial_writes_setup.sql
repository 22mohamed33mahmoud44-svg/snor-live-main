-- Disposable PostgreSQL 17 only. Run AFTER gift_prices_setup.sql + _022.
-- Reconstruct the dangerous older RLS grant combination to prove _026 fixes
-- it even if somebody accidentally widened direct table privileges.
ALTER TABLE public.gift_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gift_logs insert own"
  ON public.gift_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE TABLE public.stripe_events(id text PRIMARY KEY);

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.gift_logs, public.gifts, public.transactions,
  public.users_coins, public.stripe_events, public.gift_types
  TO anon, authenticated;

GRANT INSERT ON TABLE
  public.gift_logs, public.gifts, public.transactions,
  public.users_coins, public.stripe_events, public.gift_types
  TO service_role;
GRANT SELECT ON public.gift_types TO anon, authenticated;
GRANT SELECT ON public.gift_logs, public.gifts, public.transactions,
  public.users_coins TO authenticated;

-- Keep the service-role-owned gift path usable by authenticated callers
-- via the reviewed public SECURITY INVOKER wrapper.
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.send_gift_safe(uuid,uuid,text,integer) TO authenticated;

