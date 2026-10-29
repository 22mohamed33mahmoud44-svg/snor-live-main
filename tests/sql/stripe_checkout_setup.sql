-- Run ONLY against a disposable PostgreSQL test database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.users_coins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  coins integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  meta jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION public.add_coins(
  p_user_id uuid, p_amount integer, p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid coins'; END IF;
  INSERT INTO public.users_coins(user_id, coins) VALUES (p_user_id, p_amount)
    ON CONFLICT(user_id) DO UPDATE SET
      coins = public.users_coins.coins + excluded.coins, updated_at = now();
  INSERT INTO public.transactions(user_id, type, amount, meta)
    VALUES (p_user_id, 'buy', p_amount, coalesce(p_meta, '{}'::jsonb));
END;
$$;
INSERT INTO auth.users (id) VALUES ('11111111-1111-4111-8111-111111111111');
