create unique index if not exists transactions_provider_txn_unique
on public.transactions(provider, provider_txn_id)
where provider is not null and provider_txn_id is not null;

create or replace function public.add_coins(p_user_id uuid, p_amount integer, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_provider text;
  v_provider_txn_id text;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'add_coins: invalid input';
  end if;

  v_provider := nullif(btrim(coalesce(p_meta->>'provider','')), '');
  v_provider_txn_id := nullif(btrim(coalesce(
    p_meta->>'provider_txn_id',
    p_meta->>'paymob_transaction_id',
    p_meta->>'stripe_event_id',
    p_meta->>'stripe_transaction_id',
    p_meta->>'xsolla_transaction_id',
    ''
  )), '');

  if v_provider is null then
    if p_meta ? 'paymob_transaction_id' then v_provider := 'paymob';
    elsif p_meta ? 'stripe_event_id' or p_meta ? 'stripe_transaction_id' then v_provider := 'stripe';
    elsif p_meta ? 'xsolla_transaction_id' then v_provider := 'xsolla';
    end if;
  end if;

  begin
    insert into public.transactions(user_id, type, amount, meta, provider, provider_txn_id)
    values (p_user_id, 'buy', p_amount, coalesce(p_meta, '{}'::jsonb), v_provider, v_provider_txn_id);
  exception when unique_violation then
    -- Same provider transaction has already been credited.
    return;
  end;

  insert into public.users_coins(user_id, coins, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set coins = public.users_coins.coins + p_amount, updated_at = now();
end;
$$;

revoke execute on function public.add_coins(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.add_coins(uuid,integer,jsonb) to service_role;