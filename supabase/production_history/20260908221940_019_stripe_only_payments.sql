/* Retire Paymob/Xsolla and keep Stripe-only payment infrastructure. */
DROP TABLE IF EXISTS public.paymob_events CASCADE;
DROP TABLE IF EXISTS public.coin_transactions CASCADE;
DROP FUNCTION IF EXISTS public.increment_coins(uuid, integer);
DROP INDEX IF EXISTS public.idx_transactions_provider_txn_unique;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_txn_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider;
CREATE TABLE IF NOT EXISTS public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_events TO service_role;
COMMENT ON TABLE public.stripe_events IS 'Server-only Stripe webhook idempotency ledger.';