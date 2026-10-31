create table if not exists public.xsolla_events (
  event_key text primary key,
  user_id uuid,
  sku text,
  coins integer check (coins is null or coins > 0),
  status text not null check (status in ('processing','success','failed','sandbox')),
  processed_at timestamptz not null default now()
);
alter table public.xsolla_events enable row level security;
revoke all on table public.xsolla_events from public, anon, authenticated;
grant select, insert, update, delete on table public.xsolla_events to service_role;