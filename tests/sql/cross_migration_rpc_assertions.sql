-- Runs AFTER _022, then _024 on one disposable PostgreSQL 17 database.
DO $cross_migration_regression$
DECLARE
  v_privileged_count integer;
  v_anon_count integer;
  v_authenticated_count integer;
BEGIN
  SELECT count(*),
    count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')),
    count(*) FILTER (WHERE has_function_privilege('authenticated',p.oid,'EXECUTE'))
  INTO v_privileged_count,v_anon_count,v_authenticated_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND position('auth.uid()' IN lower(pg_get_functiondef(p.oid)))>0;

  IF v_privileged_count <> 27 OR v_anon_count <> 0
     OR v_authenticated_count <> 27 THEN
    RAISE EXCEPTION 'Cross-migration privileged RPC ACL incorrect: total %, anon %, authenticated %',
      v_privileged_count,v_anon_count,v_authenticated_count;
  END IF;

  IF (SELECT prosecdef FROM pg_proc
    WHERE oid='public.send_stream_gift(uuid,uuid,text,integer)'::regprocedure)
    OR has_function_privilege('anon',
      'public.send_stream_gift(uuid,uuid,text,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.send_stream_gift(uuid,uuid,text,integer)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Migration _022 gift wrapper not secure after _024';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc
    WHERE oid='public.request_show_access(uuid,text)'::regprocedure
      AND prosecdef) THEN
    RAISE EXCEPTION 'Migration _022 paid show wrapper was not installed';
  END IF;
END;
$cross_migration_regression$;

SET ROLE anon;
DO $deny_anonymous$
BEGIN
  BEGIN
    PERFORM public.request_show_access(
      '44444444-4444-4444-8444-444444444444', 'rose'
    );
    RAISE EXCEPTION 'Anonymous user invoked SECURITY DEFINER paid-show RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$deny_anonymous$;
RESET ROLE;

SELECT 'Actual _022 followed by _024 passes RPC count and permission invariants' AS result;
