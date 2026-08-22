-- Keep live-stream liveness cleanup under source control.
-- A stream is ended only after three missed 20-second heartbeats.
-- The job itself runs with database privileges; browser roles cannot call it.

CREATE OR REPLACE FUNCTION public.mark_dead_streams_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
  SET is_live = false
  WHERE is_live = true
    AND last_heartbeat_at < now() - interval '60 seconds';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_dead_streams_offline() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_dead_streams_offline() FROM anon;
REVOKE ALL ON FUNCTION public.mark_dead_streams_offline() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dead_streams_offline() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Reusing the job name updates the existing schedule instead of creating
    -- duplicate cleanup jobs.
    PERFORM cron.schedule(
      'mark-dead-streams',
      '* * * * *',
      'SELECT public.mark_dead_streams_offline()'
    );
  ELSE
    RAISE NOTICE 'pg_cron is not installed; mark_dead_streams_offline() must be scheduled externally';
  END IF;
END;
$$;
