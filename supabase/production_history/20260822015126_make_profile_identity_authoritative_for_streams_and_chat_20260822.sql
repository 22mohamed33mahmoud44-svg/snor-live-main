-- Normalize existing denormalized display names to the authoritative profile username.
update public.stream_chat c
set username = p.username
from app_private.profiles p
where p.id = c.user_id and c.username is distinct from p.username;

update public.live_streams l
set streamer_name = p.username
from app_private.profiles p
where p.id = l.user_id and l.streamer_name is distinct from p.username;

-- Never trust client-supplied display names on stream/chat writes.
create or replace function app_private.set_stream_chat_identity()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
declare v_username text;
begin
  select p.username into v_username
  from app_private.profiles p
  where p.id = new.user_id;

  if v_username is null or btrim(v_username) = '' then
    raise exception 'profile_required';
  end if;

  new.username := v_username;
  return new;
end;
$$;

create or replace function app_private.set_live_stream_identity()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
declare v_username text;
begin
  select p.username into v_username
  from app_private.profiles p
  where p.id = new.user_id;

  if v_username is null or btrim(v_username) = '' then
    raise exception 'profile_required';
  end if;

  new.streamer_name := v_username;
  return new;
end;
$$;

revoke all on function app_private.set_stream_chat_identity() from public, anon, authenticated;
revoke all on function app_private.set_live_stream_identity() from public, anon, authenticated;

drop trigger if exists enforce_stream_chat_identity on public.stream_chat;
create trigger enforce_stream_chat_identity
before insert or update of user_id, username on public.stream_chat
for each row execute function app_private.set_stream_chat_identity();

drop trigger if exists enforce_live_stream_identity on public.live_streams;
create trigger enforce_live_stream_identity
before insert or update of user_id, streamer_name on public.live_streams
for each row execute function app_private.set_live_stream_identity();

-- Keep historical denormalized names in sync when a username changes.
create or replace function app_private.sync_username_denormalizations()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  if old.username is distinct from new.username then
    update public.stream_chat set username = new.username where user_id = new.id;
    update public.live_streams set streamer_name = new.username where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_username_denormalizations() from public, anon, authenticated;

drop trigger if exists sync_username_denormalizations on app_private.profiles;
create trigger sync_username_denormalizations
after update of username on app_private.profiles
for each row execute function app_private.sync_username_denormalizations();