alter table public.profiles
  alter column birthdate type date using birthdate::date;

alter table public.matches
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.messages
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.signals
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.waiting_users
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column created_at set default now(),
  alter column created_at set not null;