create or replace function app_private.handle_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  update public.matches
  set status='ended'
  where status='active' and (user1=old.id or user2=old.id);

  return old;
end;
$$;

revoke all on function app_private.handle_auth_user_delete() from public, anon, authenticated;

drop trigger if exists before_auth_user_delete_end_matches on auth.users;
create trigger before_auth_user_delete_end_matches
before delete on auth.users
for each row execute function app_private.handle_auth_user_delete();