/*
# Migration 019: Stripe-only payments
#
# Retire the abandoned Paymob/Xsolla payment surfaces and keep only the
# Stripe webhook idempotency ledger required by the active payment flow.
*/

-- Retired payment ledgers from the old gateways.
DROP TABLE IF EXISTS public.paymob_events CASCADE;
DROP TABLE IF EXISTS public.coin_transactions CASCADE;

-- Retired server-only coin credit helper that was used by Xsolla.
DROP FUNCTION IF EXISTS public.increment_coins(uuid, integer);

-- Remove legacy provider-specific transaction fields if they still exist.
DROP INDEX IF EXISTS public.idx_transactions_provider_txn_unique;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_txn_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider;

-- Stripe webhook idempotency ledger.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_events TO service_role;

COMMENT ON TABLE public.stripe_events IS 'Server-only Stripe webhook idempotency ledger.';
