-- After intentionally failing the guard on a disposable PostgreSQL 17 DB,
-- no index may have been installed and no active broadcast may have changed.
DO $assert$
BEGIN
  IF to_regclass('public.uq_live_streams_one_active_per_user') IS NOT NULL THEN
    RAISE EXCEPTION 'Failed preflight installed a partial index anyway';
  END IF;
  IF (SELECT count(*) FROM public.live_streams WHERE is_live) <> 2 THEN
    RAISE EXCEPTION 'Failed preflight silently altered existing active broadcasts';
  END IF;
END;
$assert$;
SELECT 'duplicate-active preflight rejected without modifying user stream history' AS result;
