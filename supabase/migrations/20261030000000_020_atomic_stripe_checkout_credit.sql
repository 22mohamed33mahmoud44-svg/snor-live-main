-- Credit verified Stripe checkout events exactly once in a single transaction.
-- Only the service role (used by the verified webhook) may call this RPC.
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

  INSERT INTO public.stripe_events (stripe_event_id, type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

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
