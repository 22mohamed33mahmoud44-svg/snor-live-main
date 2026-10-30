alter default privileges for role postgres in schema app_private revoke execute on functions from public;
alter default privileges for role postgres in schema app_private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema app_private revoke all on sequences from public, anon, authenticated;

-- Explicitly keep the only helper intended for the masked public profile view callable by read roles.
grant execute on function app_private.profile_api_rows() to anon, authenticated, service_role;