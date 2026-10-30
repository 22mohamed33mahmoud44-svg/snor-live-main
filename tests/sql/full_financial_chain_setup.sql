-- Disposable PostgreSQL 17 only, after gift_prices_setup.sql,
-- combined_wallet_setup.sql, cross_migration_rpc_setup.sql.
-- Mirror the historical overbroad browser grants which _026 must revoke.
ALTER TABLE public.gift_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gift_logs insert own" ON public.gift_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.gift_logs, public.gifts, public.transactions,
  public.users_coins, public.stripe_events, public.gift_types
TO anon, authenticated;

GRANT INSERT ON TABLE
  public.gift_logs, public.gifts, public.transactions,
  public.users_coins, public.stripe_events, public.gift_types
TO service_role;

GRANT SELECT ON public.gift_types TO anon, authenticated;
GRANT SELECT ON public.users_coins, public.transactions,
  public.gift_logs, public.gifts TO authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.send_gift_safe(uuid,uuid,text,integer)
  TO authenticated;
