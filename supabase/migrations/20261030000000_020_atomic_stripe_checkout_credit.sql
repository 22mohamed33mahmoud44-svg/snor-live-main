-- Credit verified Stripe checkout events exactly once in a single transaction.
-- Only the service role (used by the verified webhook) may call this RPC.

-- Critical: widening the ledger constraint to permit 'buy' must never
-- make direct coin minting available to browser-issued JWTs.
-- Production already restricts add_coins to service_role; enforce that same
-- rule on staging and all future deployments, including deployments where
-- the function was created with PostgreSQL's default PUBLIC EXECUTE grant.
REVOKE ALL ON FUNCTION public.add_coins(uuid,integer,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_coins(uuid,integer,jsonb)
TO service_role;

-- PRODUCTION COMPATIBILITY: public.add_coins() logs the transaction type 'buy',
-- but the deployed transactions_type_check currently permits only
-- spend/earn/bonus/refund. That makes every valid checkout roll back.
-- Change only this known constraint, and fail closed on unexpected schema drift.
DO $allow_checkout_buy$
DECLARE
  v_check text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_check
  FROM pg_constraint
  WHERE conrelid = 'public.transactions'::regclass
    AND conname = 'transactions_type_check' AND contype = 'c';

  IF v_check IS NULL THEN
    RAISE EXCEPTION 'Missing transactions_type_check: reconcile schema before Stripe release';
  END IF;
  IF v_check = 'CHECK ((type = ANY (ARRAY[''spend''::text, ''earn''::text, ''bonus''::text, ''refund''::text, ''buy''::text])))' THEN
    -- Already upgraded by a reviewed forward migration.
    NULL;
  ELSIF v_check = 'CHECK ((type = ANY (ARRAY[''spend''::text, ''earn''::text, ''bonus''::text, ''refund''::text])))' THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_type_check
      CHECK (type IN ('spend', 'earn', 'bonus', 'refund', 'buy'));
  ELSE
    RAISE EXCEPTION 'Unexpected transaction type policy: %', v_check;
  END IF;
END;
$allow_checkout_buy$;

-- A Stripe Checkout Session must be credited only once even if Stripe
-- sends two distinct event IDs for the same event type and session.
ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_events_checkout_session_once
  ON public.stripe_events (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credit_stripe_checkout_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_coins integer,
  p_session_id text,
  p_package_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF nullif(trim(p_event_id), '') IS NULL
     OR p_event_type <> 'checkout.session.completed'
     OR p_user_id IS NULL
     OR p_coins NOT IN (100, 500, 1000)
     OR nullif(trim(p_session_id), '') IS NULL
     OR p_package_id NOT IN ('pkg_100', 'pkg_500', 'pkg_1000')
     OR (p_package_id = 'pkg_100' AND p_coins <> 100)
     OR (p_package_id = 'pkg_500' AND p_coins <> 500)
     OR (p_package_id = 'pkg_1000' AND p_coins <> 1000)
  THEN
    RAISE EXCEPTION 'Invalid Stripe event credit parameters';
  END IF;

  INSERT INTO public.stripe_events (stripe_event_id, type, checkout_session_id)
  VALUES (p_event_id, p_event_type, p_session_id)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Failure here rolls back the event insert as part of this RPC transaction.
  PERFORM public.add_coins(
    p_user_id,
    p_coins,
    jsonb_build_object(
      'stripe_event_id', p_event_id,
      'stripe_session_id', p_session_id,
      'package_id', p_package_id
    )
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)
TO service_role;
