-- Legacy direct-match path remains compatible, but only for two genuinely waiting users.
create or replace function app_private.can_create_direct_match(p_user1 uuid, p_user2 uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog
as $$
  select
    auth.uid() is not null
    and p_user1 is not null
    and p_user2 is not null
    and p_user1 <> p_user2
    and (auth.uid() = p_user1 or auth.uid() = p_user2)
    and exists (select 1 from public.waiting_users w where w.user_id = p_user1 and w.created_at >= now() - interval '5 minutes')
    and exists (select 1 from public.waiting_users w where w.user_id = p_user2 and w.created_at >= now() - interval '5 minutes')
    and not exists (select 1 from public.matches m where m.status='active' and (m.user1 in (p_user1,p_user2) or m.user2 in (p_user1,p_user2)));
$$;
revoke all on function app_private.can_create_direct_match(uuid,uuid) from public, anon;
grant execute on function app_private.can_create_direct_match(uuid,uuid) to authenticated;

drop policy if exists "insert match" on public.matches;
create policy matches_insert_waiting_pair
on public.matches
for insert
to authenticated
with check (app_private.can_create_direct_match(user1,user2));

-- Participants may end a match, but may not rewrite its participant identities.
revoke update on public.matches from authenticated;
grant update(status) on public.matches to authenticated;

-- Direct-message receiver may only mark read state, never rewrite sender/body/recipient.
revoke update on public.private_messages from authenticated;
grant update(read) on public.private_messages to authenticated;

-- Stream owners may edit stream metadata/liveness but not forge counters or ownership.
revoke update on public.live_streams from authenticated;
grant update(title,is_live,streamer_name,thumbnail_url,last_heartbeat_at) on public.live_streams to authenticated;

-- No update path is defined for stream bans; remove the stale broad privilege.
revoke update on public.stream_bans from authenticated;

-- Block lists are account data; anonymous clients do not need the table.
revoke select on public.blocked_users from anon;

-- Signaling is valid only while a match is active.
drop policy if exists signals_insert_participant on public.signals;
create policy signals_insert_participant
on public.signals
for insert
to authenticated
with check (
  sender = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = signals.match_id
      and m.status = 'active'
      and ((select auth.uid()) = m.user1 or (select auth.uid()) = m.user2)
  )
);