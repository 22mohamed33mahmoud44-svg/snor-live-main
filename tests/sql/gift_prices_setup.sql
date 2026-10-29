-- Disposable Postgres 17 fixture. NEVER run this against production.
CREATE SCHEMA auth;
CREATE SCHEMA app_private;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.gift_types (
  code text PRIMARY KEY,
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  is_active boolean NOT NULL
);

CREATE TABLE public.users_coins (
  user_id uuid PRIMARY KEY,
  coins integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  meta jsonb NOT NULL
);

CREATE TABLE public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  gift_type text NOT NULL,
  coins_cost integer NOT NULL,
  coins_earned integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.live_streams (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_live boolean NOT NULL
);

CREATE TABLE public.gift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  stream_id uuid NOT NULL,
  gift_type text NOT NULL,
  coin_cost integer NOT NULL
);

CREATE TABLE public.paid_shows (
  id uuid PRIMARY KEY,
  streamer_id uuid NOT NULL,
  required_gift_type text NOT NULL,
  required_gift_count integer NOT NULL CHECK (required_gift_count >= 1),
  is_active boolean NOT NULL DEFAULT true,
  max_viewers integer
);

CREATE TABLE public.show_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  user_id uuid NOT NULL,
  gift_id uuid NOT NULL,
  UNIQUE(show_id, user_id)
);

CREATE TABLE public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  data jsonb NOT NULL
);

-- Approximate the existing privileged wallet debit contract.
CREATE OR REPLACE FUNCTION app_private.deduct_coins(
  p_user_id uuid, p_amount integer, p_reason text, p_meta jsonb
)
RETURNS jsonb LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.users_coins
    SET coins = coins - p_amount, updated_at = now()
    WHERE user_id = p_user_id AND coins >= p_amount;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;
  INSERT INTO public.transactions(user_id, type, amount, meta)
    VALUES (p_user_id, 'spend', -p_amount, p_meta);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- This is the existing public wrapper used in production.
CREATE OR REPLACE FUNCTION public.send_gift(uuid,uuid,text,integer)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT app_private.send_gift($1,$2,$3,$4);
$$;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.gift_types (code, coin_cost, is_active)
VALUES ('rose', 10, true), ('heart', 25, true), ('disabled', 5, false);

INSERT INTO public.users_coins(user_id,coins) VALUES
  ('11111111-1111-4111-8111-111111111111', 100),
  ('22222222-2222-4222-8222-222222222222', 0);

INSERT INTO public.live_streams(id,user_id,is_live)
VALUES ('33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222',true);
