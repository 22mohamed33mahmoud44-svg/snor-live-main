create or replace function app_private.mark_dead_streams_offline()
returns void
language sql
security definer
set search_path to pg_catalog
as $$
  update public.live_streams
  set is_live=false, viewers_count=0
  where is_live=true and last_heartbeat_at < now()-interval '60 seconds';
$$;

create or replace function app_private.cleanup_matchmaking()
returns void
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  delete from public.waiting_users
  where created_at < now()-interval '5 minutes';

  update public.matches
  set status='ended'
  where status='active' and created_at < now()-interval '2 hours';

  delete from public.signals
  where created_at < now()-interval '1 day';
end;
$$;

revoke all on function app_private.mark_dead_streams_offline() from public, anon, authenticated;
revoke all on function app_private.cleanup_matchmaking() from public, anon, authenticated;

create or replace function public.mark_dead_streams_offline()
returns void
language sql
security invoker
set search_path to pg_catalog
as $$ select app_private.mark_dead_streams_offline(); $$;

create or replace function public.cleanup_matchmaking()
returns void
language sql
security invoker
set search_path to pg_catalog
as $$ select app_private.cleanup_matchmaking(); $$;

revoke all on function public.mark_dead_streams_offline() from public, anon, authenticated;
revoke all on function public.cleanup_matchmaking() from public, anon, authenticated;
grant execute on function public.mark_dead_streams_offline() to service_role;
grant execute on function public.cleanup_matchmaking() to service_role;