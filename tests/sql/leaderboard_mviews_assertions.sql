-- Ensure public/read-only callers cannot bypass RLS through the materialized views.
DO $checks$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'leaderboard_most_followed',
    'leaderboard_top_streamers',
    'leaderboard_top_gifters'
  ] LOOP
    IF has_table_privilege('anon','public.' || v_table,'SELECT') THEN
      RAISE EXCEPTION 'Anonymous read remains allowed on %',v_table;
    END IF;
    IF has_table_privilege('authenticated','public.' || v_table,'SELECT') THEN
      RAISE EXCEPTION 'Authenticated API role can bypass RLS on %',v_table;
    END IF;
    IF NOT has_table_privilege('service_role','public.' || v_table,'SELECT') THEN
      RAISE EXCEPTION 'Server-side leaderboard access removed from %',v_table;
    END IF;
  END LOOP;
END
$checks$;

SET ROLE anon;
DO $check_anon$
BEGIN
  BEGIN
    PERFORM user_id FROM public.leaderboard_top_gifters;
    RAISE EXCEPTION 'Anonymous could read the gifts leaderboard';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$check_anon$;
RESET ROLE;

SET ROLE authenticated;
DO $check_auth$
BEGIN
  BEGIN
    PERFORM user_id FROM public.leaderboard_top_streamers;
    RAISE EXCEPTION 'Signed-in client could read unprotected materialized view';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$check_auth$;
RESET ROLE;

SET ROLE service_role;
SELECT user_id FROM public.leaderboard_most_followed LIMIT 1;
RESET ROLE;
SELECT 'private materialized leaderboard grants verified' AS result;
