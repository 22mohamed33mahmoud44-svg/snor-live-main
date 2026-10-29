DO $assert_permissions$
DECLARE
  v_anon integer;
  v_authenticated integer;
  v_n integer;
BEGIN
  SELECT count(*),
    count(*) FILTER (WHERE pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
    count(*) FILTER (WHERE pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    INTO v_n, v_anon, v_authenticated
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef;

  IF v_n <> 28 OR v_anon <> 0 OR v_authenticated <> 28 THEN
    RAISE EXCEPTION 'RPC grants unexpected: total %, anon %, signed-in %',
      v_n, v_anon, v_authenticated;
  END IF;

  IF NOT has_function_privilege('anon','public.get_gift_cost()','EXECUTE') THEN
    RAISE EXCEPTION 'Public read-only function access was incorrectly removed';
  END IF;
END;
$assert_permissions$;

SET ROLE anon;
DO $anon_test$
BEGIN
  BEGIN
    PERFORM public.apply_referral_code();
    RAISE EXCEPTION 'Anonymous RPC executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$anon_test$;
RESET ROLE;

SET ROLE authenticated;
SELECT public.apply_referral_code();
RESET ROLE;

SELECT '28 user-specific RPCs are inaccessible to anonymous callers' AS result;
