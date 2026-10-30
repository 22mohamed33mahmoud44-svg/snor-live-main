-- STAGING-ONLY REVIEW PATCH. NOT APPLIED TO PRODUCTION.
-- Execute only after migration-history reconciliation on an isolated clone,
-- verifying that no existing account already has multiple active streams.
--
-- PostgreSQL enforces this invariant atomically even if a user presses
-- "Start" from two devices at the same time. Ended rows remain as history.
-- Creating this index takes a write lock: plan a maintenance-safe rollout.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.live_streams') IS NULL THEN
    RAISE EXCEPTION 'live_streams table missing; reconcile schema before installing single-active-stream guard';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.live_streams
    WHERE is_live IS TRUE
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Existing duplicate active streams: reconcile them before enabling one-active-stream-per-owner index',
      HINT = 'Audit conflicting stream IDs in isolated staging; do not automatically end or delete broadcasts in production';
  END IF;
END;
$preflight$;

-- Intentionally no IF NOT EXISTS: an existing object with this name must
-- be reviewed, rather than silently assuming it has the correct definition.
CREATE UNIQUE INDEX uq_live_streams_one_active_per_user
  ON public.live_streams (user_id)
  WHERE is_live IS TRUE;

COMMIT;
