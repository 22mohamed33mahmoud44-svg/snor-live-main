-- ════════════════════════════════════════════════════════════════
-- 003: Payment hardening — real idempotency + atomic coin credits
-- Run this BEFORE deploying the updated xsolla-webhook function.
-- ════════════════════════════════════════════════════════════════

-- ── 1. transactions: dedicated idempotency columns ───────────────
-- The webhook previously relied on a duplicate-key error on a JSONB
-- meta field, which has no unique constraint — replayed webhooks
-- credited coins repeatedly. A real unique column fixes this.
DO $$
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    CREATE TABLE public.transactions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      amount           INTEGER,
      provider         TEXT,
      provider_txn_id  TEXT,
      meta             JSONB DEFAULT '{}',
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "transactions read own" ON public.transactions
      FOR SELECT USING (auth.uid() = user_id);
    -- No INSERT/UPDATE/DELETE policies: only the service role
    -- (webhooks) may write payment records.
  ELSE
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount          INTEGER;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider        TEXT;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_txn_id TEXT;
  END IF;
END $$;

-- Unique per provider so IDs from Xsolla/Paymob/Stripe can't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_provider_txn
  ON public.transactions (provider, provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;

-- ── 2. users_coins: ensure the balance table exists ───────────────
DO $$
BEGIN
  IF to_regclass('public.users_coins') IS NULL THEN
    CREATE TABLE public.users_coins (
      user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      coins      INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public.users_coins ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "users_coins read own" ON public.users_coins
      FOR SELECT USING (auth.uid() = user_id);
    -- No client write policies: balances change only via SECURITY
    -- DEFINER functions or the service role.
  END IF;
END $$;

-- ── 3. increment_coins: atomic upsert-increment ───────────────────
-- Always ADDS to the balance (never overwrites), creates the row if
-- missing, and is atomic under concurrent webhooks.
CREATE OR REPLACE FUNCTION public.increment_coins(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'p_amount must not be null';
  END IF;

  INSERT INTO users_coins (user_id, coins, updated_at)
  VALUES (p_user_id, GREATEST(p_amount, 0), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    coins      = users_coins.coins + p_amount,
    updated_at = NOW()
  RETURNING coins INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Clients must never call this directly — service role / webhooks only.
REVOKE ALL ON FUNCTION public.increment_coins(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coins(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.increment_coins(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coins(UUID, INTEGER) TO service_role;
