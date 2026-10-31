-- Disposable PostgreSQL 17 only; rejects fake monetary ledger writes.
DO $finance_grants$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gift_logs','gifts','transactions','users_coins','stripe_events','gift_types'
  ] LOOP
    IF has_table_privilege('authenticated','public.' || t,'INSERT')
       OR has_table_privilege('authenticated','public.' || t,'UPDATE')
       OR has_table_privilege('authenticated','public.' || t,'DELETE')
       OR has_table_privilege('anon','public.' || t,'INSERT')
       OR has_table_privilege('anon','public.' || t,'UPDATE')
       OR has_table_privilege('anon','public.' || t,'DELETE') THEN
      RAISE EXCEPTION 'Direct financial writes remain open on %',t;
    END IF;
    IF NOT has_table_privilege('service_role','public.' || t,'INSERT') THEN
      RAISE EXCEPTION 'Service role financial write access broken on %',t;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('anon','public.gift_types','SELECT')
     OR NOT has_table_privilege('authenticated','public.gift_types','SELECT')
     OR NOT has_table_privilege('authenticated','public.users_coins','SELECT') THEN
    RAISE EXCEPTION 'Read-only catalog/wallet privileges removed accidentally';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='gift_logs'
      AND cmd IN ('INSERT','ALL')
      AND ('authenticated'=ANY(roles) OR 'public'=ANY(roles))
  ) THEN
    RAISE EXCEPTION 'RLS permits browser-authored forged gift logs';
  END IF;
END;
$finance_grants$;

-- Test against a deliberately re-granted INSERT right: RLS must STILL
-- prevent forging an own-sender gift without debiting any coins.
GRANT INSERT ON public.gift_logs TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

DO $rls_regrant_proof$
BEGIN
  BEGIN
    INSERT INTO public.gift_logs(sender_id,receiver_id,stream_id,gift_type,coin_cost)
      VALUES('11111111-1111-4111-8111-111111111111',
             '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333','rose',99999);
    RAISE EXCEPTION 'A browser forged a gift log after restoring INSERT permission';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$rls_regrant_proof$;

RESET ROLE;
REVOKE INSERT ON public.gift_logs FROM authenticated;

-- The authorized gift RPC must remain able to debit the sender and insert
-- an accurately priced log with SECURITY DEFINER ownership.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

DO $legitimate_stream_gift$
DECLARE
  result jsonb;
BEGIN
  result := public.send_stream_gift(
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'rose', 10
  );
  IF result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Legitimate server-backed gift rejected: %',result;
  END IF;
END;
$legitimate_stream_gift$;
RESET ROLE;

DO $ledger_proof$
DECLARE
 sender_coins integer;
 receiver_coins integer;
BEGIN
  SELECT coins INTO sender_coins FROM public.users_coins
    WHERE user_id='11111111-1111-4111-8111-111111111111';
  SELECT coins INTO receiver_coins FROM public.users_coins
    WHERE user_id='22222222-2222-4222-8222-222222222222';
  IF sender_coins <> 90 OR receiver_coins <> 7 THEN
    RAISE EXCEPTION 'Legitimate stream gift accounting mismatch: %, %',sender_coins,receiver_coins;
  END IF;
  IF (SELECT count(*) FROM public.gift_logs) <> 1 THEN
    RAISE EXCEPTION 'Forged gift log inserted or legitimate gift not logged';
  END IF;
  IF (SELECT count(*) FROM public.transactions) <> 2 THEN
    RAISE EXCEPTION 'Gift debit and earnings transactions not both recorded';
  END IF;
END;
$ledger_proof$;

SELECT 'Financial browser-write grants and forged gift ledger tests passed' AS result;
