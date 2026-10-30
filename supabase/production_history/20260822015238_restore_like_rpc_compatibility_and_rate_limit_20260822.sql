create table if not exists app_private.stream_like_rate (
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  window_start timestamptz not null,
  like_count integer not null check (like_count between 1 and 300),
  primary key (user_id, stream_id, window_start)
);
revoke all on app_private.stream_like_rate from public, anon, authenticated;
grant all on app_private.stream_like_rate to service_role;

create or replace function app_private.increment_stream_likes(
  target_stream_id uuid,
  increment_count integer default 1
) returns void
language plpgsql
security definer
set search_path to pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if increment_count is null or increment_count < 1 or increment_count > 100 then
    raise exception 'increment_count must be between 1 and 100';
  end if;
  if not exists (select 1 from public.live_streams where id=target_stream_id and is_live=true) then
    raise exception 'stream not live';
  end if;

  insert into app_private.stream_like_rate(user_id,stream_id,window_start,like_count)
  values (v_user_id,target_stream_id,v_window,increment_count)
  on conflict (user_id,stream_id,window_start)
  do update set like_count = app_private.stream_like_rate.like_count + excluded.like_count
  where app_private.stream_like_rate.like_count + excluded.like_count <= 300
  returning like_count into v_count;

  if v_count is null then
    raise exception 'like rate limit exceeded';
  end if;

  update public.live_streams
  set likes_count = coalesce(likes_count,0) + increment_count
  where id=target_stream_id and is_live=true;
end;
$$;

-- Current API, with batching.
create or replace function public.increment_stream_likes(
  target_stream_id uuid,
  increment_count integer default 1
) returns void
language sql
security invoker
set search_path to pg_catalog
as $$ select app_private.increment_stream_likes(target_stream_id,increment_count); $$;

-- Backward-compatible API used by older frontend builds.
create or replace function public.increment_stream_likes(stream_id_input uuid)
returns void
language sql
security invoker
set search_path to pg_catalog
as $$ select app_private.increment_stream_likes(stream_id_input,1); $$;

revoke all on function public.increment_stream_likes(uuid,integer) from public, anon;
revoke all on function public.increment_stream_likes(uuid) from public, anon;
grant execute on function public.increment_stream_likes(uuid,integer) to authenticated;
grant execute on function public.increment_stream_likes(uuid) to authenticated;

-- Opportunistic cleanup; keeps only recent rate windows.
create or replace function app_private.cleanup_like_rate_windows()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  delete from app_private.stream_like_rate where window_start < now() - interval '10 minutes';
  return new;
end;
$$;
revoke all on function app_private.cleanup_like_rate_windows() from public, anon, authenticated;
drop trigger if exists cleanup_like_rate_windows on app_private.stream_like_rate;
create trigger cleanup_like_rate_windows
after insert on app_private.stream_like_rate
for each statement execute function app_private.cleanup_like_rate_windows();