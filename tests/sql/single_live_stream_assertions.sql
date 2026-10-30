-- The real staging-only SQL patch was applied by CI before this script.
DO $tests$
DECLARE
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_other uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'live_streams'
      AND c.relname = 'uq_live_streams_one_active_per_user'
      AND i.indisunique
      AND i.indisvalid
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%is_live IS TRUE%'
  ) THEN
    RAISE EXCEPTION 'Staged partial unique index not installed with expected active-only predicate';
  END IF;

  INSERT INTO public.live_streams (id, user_id, title, is_live) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', v_owner, 'first live broadcast', true);

  -- Simulates a second device trying to launch under the same user_id.
  BEGIN
    INSERT INTO public.live_streams (id, user_id, title, is_live) VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', v_owner, 'second live broadcast', true);
    RAISE EXCEPTION 'Duplicate active broadcast was incorrectly accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%uq_live_streams_one_active_per_user%' THEN
      RAISE;
    END IF;
  END;

  -- Different accounts are unaffected.
  INSERT INTO public.live_streams (id, user_id, title, is_live) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', v_other, 'other account live', true);

  -- Converting an old ended row to LIVE is also guarded.
  BEGIN
    UPDATE public.live_streams SET is_live = true
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    RAISE EXCEPTION 'Reopening a historical stream bypassed active-stream guard';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- End allows the same user to launch a new stream; keep all older rows.
  UPDATE public.live_streams SET is_live = false
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

  INSERT INTO public.live_streams (id, user_id, title, is_live) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', v_owner, 'new live after ending', true);

  IF (SELECT count(*) FROM public.live_streams WHERE user_id = v_owner AND is_live) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one current broadcast after orderly restart';
  END IF;

  IF (SELECT count(*) FROM public.live_streams WHERE user_id = v_owner AND NOT is_live) <> 3 THEN
    RAISE EXCEPTION 'Finished stream history was destroyed';
  END IF;
END;
$tests$;
SELECT 'single active stream unique index: duplicate launch, history, and restart verified' AS result;
