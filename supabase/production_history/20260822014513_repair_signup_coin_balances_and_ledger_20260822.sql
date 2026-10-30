create unique index if not exists transactions_signup_bonus_unique
on public.transactions(user_id)
where type='bonus' and meta->>'reason'='signup_bonus';

insert into public.users_coins(user_id, coins, updated_at)
select u.id, 10, now()
from auth.users u
left join public.users_coins c on c.user_id=u.id
where c.user_id is null
on conflict (user_id) do nothing;

insert into public.transactions(user_id, type, amount, meta, created_at)
select c.user_id, 'bonus', 10, jsonb_build_object('reason','signup_bonus'), now()
from public.users_coins c
where c.coins = 10
  and not exists (select 1 from public.transactions t where t.user_id=c.user_id)
on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $$
begin
  insert into public.users_coins(user_id, coins, updated_at)
  values (new.id, 10, now())
  on conflict (user_id) do nothing;

  insert into public.transactions(user_id, type, amount, meta, created_at)
  values (new.id, 'bonus', 10, jsonb_build_object('reason','signup_bonus'), now())
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;