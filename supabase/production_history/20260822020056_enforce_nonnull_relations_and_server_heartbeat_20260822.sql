alter table public.stream_chat alter column stream_id set not null;
alter table public.private_messages alter column sender_id set not null, alter column receiver_id set not null;
alter table public.private_messages add constraint private_messages_no_self_check check (sender_id <> receiver_id);
alter table public.gift_logs alter column sender_id set not null, alter column receiver_id set not null, alter column stream_id set not null;
alter table public.live_streams alter column last_heartbeat_at set not null;

create or replace function app_private.normalize_live_stream_heartbeat()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  if tg_op='INSERT' then
    new.last_heartbeat_at := now();
  elsif new.is_live = true and (
    old.is_live is distinct from new.is_live
    or new.last_heartbeat_at is distinct from old.last_heartbeat_at
  ) then
    new.last_heartbeat_at := now();
  elsif new.last_heartbeat_at is null then
    new.last_heartbeat_at := old.last_heartbeat_at;
  end if;
  return new;
end;
$$;
revoke all on function app_private.normalize_live_stream_heartbeat() from public, anon, authenticated;

drop trigger if exists normalize_live_stream_heartbeat on public.live_streams;
create trigger normalize_live_stream_heartbeat
before insert or update of is_live,last_heartbeat_at on public.live_streams
for each row execute function app_private.normalize_live_stream_heartbeat();