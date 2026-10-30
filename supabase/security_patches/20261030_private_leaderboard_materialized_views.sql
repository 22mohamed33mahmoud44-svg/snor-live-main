-- Staged security patch: block Data API clients from querying unprotected
-- materialized leaderboards. Materialized views do not support RLS.
--
-- Confirmed on the current live Supabase schema (2026-10-30):
--   public.leaderboard_most_followed
--   public.leaderboard_top_streamers
--   public.leaderboard_top_gifters
-- Existing service_role access remains intact for trusted server functions.
-- No frontend source references these views at the time of this patch.
--
-- Apply only after checking the intended release database. The repository
-- migration ledger does not currently match the live Supabase ledger.
REVOKE ALL PRIVILEGES ON TABLE
  public.leaderboard_most_followed,
  public.leaderboard_top_streamers,
  public.leaderboard_top_gifters
FROM PUBLIC, anon, authenticated;

-- Defensively prevent accidental future usage via permissive grants.
DO $verify_leaderboard_access$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'leaderboard_most_followed',
    'leaderboard_top_streamers',
    'leaderboard_top_gifters'
  ] LOOP
    IF pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'API-facing leaderboard still readable: %', v_table;
    END IF;

    IF NOT pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'Trusted service_role leaderboard reader lost access: %', v_table;
    END IF;
  END LOOP;
END
$verify_leaderboard_access$;
