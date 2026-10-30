drop view if exists public.public_profiles;

alter table public.profiles set schema app_private;

-- The underlying table is no longer a client-facing Data API object.
revoke all on app_private.profiles from public, anon, authenticated;
grant all on app_private.profiles to service_role;

-- Defense in depth: if table privileges are ever granted by mistake, users only see/write their own row.
drop policy if exists profiles_public_select on app_private.profiles;
drop policy if exists profiles_owner_select on app_private.profiles;
create policy profiles_owner_select
on app_private.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Read helper returns public fields for everyone and private fields only to the owner.
create or replace function app_private.profile_api_rows()
returns table(
  id uuid,
  username text,
  gender text,
  birthdate date,
  avatar_url text,
  hide_online boolean,
  show_in_radar boolean,
  full_name text,
  looking_for text
)
language sql
stable
security definer
set search_path to pg_catalog
as $$
  select
    p.id,
    p.username,
    p.gender,
    case when auth.uid() = p.id then p.birthdate else null end,
    p.avatar_url,
    case when auth.uid() = p.id then p.hide_online else null end,
    case when auth.uid() = p.id then p.show_in_radar else null end,
    p.full_name,
    case when auth.uid() = p.id then p.looking_for else null end
  from app_private.profiles p;
$$;

revoke all on function app_private.profile_api_rows() from public;
grant execute on function app_private.profile_api_rows() to anon, authenticated, service_role;
grant usage on schema app_private to anon, authenticated, service_role;

-- Public compatibility view: same object name and column names used by the frontend.
create view public.profiles
with (security_invoker = true)
as
select * from app_private.profile_api_rows();

-- Route profile writes to the private table while enforcing ownership.
create or replace function app_private.write_profile_view()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if tg_op = 'INSERT' then
    if new.id is null or new.id is distinct from auth.uid() then
      raise exception 'not authorized';
    end if;

    insert into app_private.profiles(
      id, username, gender, birthdate, avatar_url,
      hide_online, show_in_radar, full_name, looking_for
    ) values (
      new.id,
      new.username,
      new.gender,
      new.birthdate,
      new.avatar_url,
      coalesce(new.hide_online, false),
      coalesce(new.show_in_radar, true),
      new.full_name,
      new.looking_for
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.id is distinct from auth.uid() or new.id is distinct from old.id then
      raise exception 'not authorized';
    end if;

    update app_private.profiles
    set username = new.username,
        gender = new.gender,
        birthdate = new.birthdate,
        avatar_url = new.avatar_url,
        hide_online = coalesce(new.hide_online, false),
        show_in_radar = coalesce(new.show_in_radar, true),
        full_name = new.full_name,
        looking_for = new.looking_for
    where id = old.id;
    return new;
  end if;

  raise exception 'unsupported operation';
end;
$$;

revoke all on function app_private.write_profile_view() from public, anon, authenticated;

drop trigger if exists profiles_view_write on public.profiles;
create trigger profiles_view_write
instead of insert or update on public.profiles
for each row execute function app_private.write_profile_view();

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.profiles to service_role;

-- Explicit safe public projection retained for existing code.
create view public.public_profiles
with (security_invoker = true)
as
select id, username, full_name, avatar_url, gender
from public.profiles;

revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to anon, authenticated, service_role;