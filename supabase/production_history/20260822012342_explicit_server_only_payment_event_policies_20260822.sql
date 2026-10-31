create policy "paymob_events_no_client_access" on public.paymob_events
as restrictive for all to anon, authenticated
using (false) with check (false);

create policy "xsolla_events_no_client_access" on public.xsolla_events
as restrictive for all to anon, authenticated
using (false) with check (false);