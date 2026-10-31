-- Remove external payment / payout persistence and RPCs.
DROP FUNCTION IF EXISTS public.add_coins_safe(uuid, integer, text);
DROP FUNCTION IF EXISTS public.add_coins(uuid, integer, jsonb);

DROP TABLE IF EXISTS public.paymob_events;
DROP TABLE IF EXISTS public.xsolla_events;
DROP TABLE IF EXISTS public.stripe_events;
DROP TABLE IF EXISTS public.pending_orders;

-- Monetary payout feature is also removed so no external money-transfer path remains.
DROP TABLE IF EXISTS public.withdrawals;

-- Remove provider-specific identifiers from otherwise generic coin ledger/subscription tables.
DROP INDEX IF EXISTS public.idx_transactions_provider_txn_unique;
DROP INDEX IF EXISTS public.transactions_provider_txn_unique;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_txn_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type = ANY (ARRAY['spend'::text, 'earn'::text, 'bonus'::text, 'refund'::text]));

ALTER TABLE public.vip_subscriptions DROP COLUMN IF EXISTS stripe_sub_id;

-- Ensure future public functions are not implicitly executable by clients.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;