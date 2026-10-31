create or replace function app_private.cleanup_ended_match_signals()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  if new.status='ended' and old.status is distinct from new.status then
    delete from public.signals where match_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.cleanup_ended_match_signals() from public, anon, authenticated;

drop trigger if exists cleanup_signals_on_match_end on public.matches;
create trigger cleanup_signals_on_match_end
after update of status on public.matches
for each row
when (new.status='ended' and old.status is distinct from new.status)
execute function app_private.cleanup_ended_match_signals();