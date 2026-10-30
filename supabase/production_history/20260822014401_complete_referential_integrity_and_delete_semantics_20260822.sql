-- Missing user/match foreign keys.
alter table public.blocked_users
  add constraint blocked_users_blocker_id_fkey foreign key (blocker_id) references auth.users(id) on delete cascade,
  add constraint blocked_users_blocked_id_fkey foreign key (blocked_id) references auth.users(id) on delete cascade,
  add constraint blocked_users_no_self_check check (blocker_id <> blocked_id);

alter table public.signals
  alter column match_id set not null,
  alter column sender set not null,
  add constraint signals_match_id_fkey foreign key (match_id) references public.matches(id) on delete cascade,
  add constraint signals_sender_fkey foreign key (sender) references auth.users(id) on delete cascade;

alter table public.stream_bans
  add constraint stream_bans_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint stream_bans_banned_by_fkey foreign key (banned_by) references auth.users(id) on delete cascade;

alter table public.waiting_users
  add constraint waiting_users_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Existing FKs that should not block account deletion / stream deletion.
alter table public.daily_bonus_claims
  drop constraint daily_bonus_claims_user_id_fkey,
  add constraint daily_bonus_claims_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.gifts
  drop constraint gifts_sender_id_fkey,
  drop constraint gifts_receiver_id_fkey,
  add constraint gifts_sender_id_fkey foreign key (sender_id) references auth.users(id) on delete cascade,
  add constraint gifts_receiver_id_fkey foreign key (receiver_id) references auth.users(id) on delete cascade;

alter table public.vip_subscriptions
  drop constraint vip_subscriptions_user_id_fkey,
  add constraint vip_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.stream_chat
  drop constraint stream_chat_stream_id_fkey,
  add constraint stream_chat_stream_id_fkey foreign key (stream_id) references public.live_streams(id) on delete cascade;

-- Relationship invariants.
alter table public.follows
  add constraint follows_no_self_check check (follower_id <> following_id);

alter table public.matches
  add constraint matches_active_participants_check check (
    status <> 'active' or (user1 is not null and user2 is not null and user1 <> user2)
  );

alter table public.vip_subscriptions
  add constraint vip_subscription_dates_check check (expires_at > started_at);

-- Cover the new foreign keys used in lookups/deletes.
create index if not exists blocked_users_blocked_id_idx on public.blocked_users(blocked_id);
create index if not exists signals_match_id_idx on public.signals(match_id);
create index if not exists signals_sender_idx on public.signals(sender);
create index if not exists stream_bans_user_id_idx on public.stream_bans(user_id);
create index if not exists stream_bans_banned_by_idx on public.stream_bans(banned_by);