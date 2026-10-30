-- Only for disposable PostgreSQL CI instances.
-- Run AFTER gift_prices_setup.sql; reuse its real wallet and gift tables
-- so Stripe credits and gifts share the same coin ledger.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

ALTER TABLE public.users_coins
  ADD CONSTRAINT integration_coins_user_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE TABLE public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mirrors the production add_coins(uuid, integer, jsonb) contract.
-- Production still needs end-to-end validation on a schema-compatible clone.
CREATE OR REPLACE FUNCTION public.add_coins(
  p_user_id uuid,
  p_amount integer,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid coin amount';
  END IF;
  INSERT INTO public.users_coins(user_id, coins)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET
    coins = public.users_coins.coins + EXCLUDED.coins,
    updated_at = now();

  INSERT INTO public.transactions(user_id, type, amount, meta)
  VALUES (p_user_id, 'buy', p_amount, COALESCE(p_meta, '{}'::jsonb));
END;
$$;
