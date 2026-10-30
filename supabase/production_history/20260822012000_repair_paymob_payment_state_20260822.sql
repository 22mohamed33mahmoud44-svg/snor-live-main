create table if not exists public.paymob_events (
  transaction_id text primary key,
  merchant_order_id text not null,
  status text not null check (status in ('processing','success','failed')),
  processed_at timestamptz not null default now()
);

alter table public.paymob_events enable row level security;
revoke all on table public.paymob_events from public, anon, authenticated;
grant select, insert, update, delete on table public.paymob_events to service_role;

create index if not exists pending_orders_user_id_idx on public.pending_orders(user_id);

-- Ensure pending orders remain user-owned through Data API.
revoke update, delete on table public.pending_orders from anon, authenticated;

grant select, insert on table public.pending_orders to authenticated;
revoke all on table public.pending_orders from anon;
grant select, insert, update, delete on table public.pending_orders to service_role;