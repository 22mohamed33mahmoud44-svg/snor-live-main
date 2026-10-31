-- READ-ONLY Supabase production compatibility preflight.
-- Run this query before applying PR #16 security migrations.
-- Never use the historical repo migrations as a production replay sequence.
-- This query returns schema-only results; no account or transaction records.
WITH baseline(requirement, is_ready, reason) AS (
  VALUES
    ('PostgreSQL 17+', current_setting('server_version_num')::integer >= 170000,
      'Needed for tested schema and view privilege semantics'),
    ('matches table', to_regclass('public.matches') IS NOT NULL,
      'Direct-call invitations require existing matches'),
    ('matchmaking creation helper',
      to_regprocedure('app_private.can_create_direct_match(uuid,uuid)') IS NOT NULL,
      'The upgraded matches INSERT policy calls this helper'),
    ('matches RLS enabled',
      coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.matches')),false),
      'The match and direct-call policies require RLS'),
    ('matches authenticated INSERT policy',
      EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='matches' AND policyname='matches_insert_waiting_pair'),
      'The direct-call migration replaces this policy'),
    ('messages table', to_regclass('public.messages') IS NOT NULL,
      'Direct-call invitations require an existing chat'),
    ('blocked_users table', to_regclass('public.blocked_users') IS NOT NULL,
      'Direct-call invitations enforce blocks'),
    ('live_streams table', to_regclass('public.live_streams') IS NOT NULL,
      'LiveKit token handler checks stream status'),
    ('add_coins RPC',
      to_regprocedure('public.add_coins(uuid,integer,jsonb)') IS NOT NULL,
      'Stripe atomic checkout migration invokes this RPC'),
    ('Wallet minting is service-role only',
      to_regprocedure('public.add_coins(uuid,integer,jsonb)') IS NOT NULL
      AND NOT has_function_privilege('anon','public.add_coins(uuid,integer,jsonb)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.add_coins(uuid,integer,jsonb)','EXECUTE')
      AND has_function_privilege('service_role','public.add_coins(uuid,integer,jsonb)','EXECUTE'),
      'Never allow a browser JWT to add coins; Stripe webhook is the only crediting route'),
    ('Financial ledger browser writes forbidden',
      NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('gift_logs','gifts','transactions','users_coins','stripe_events','gift_types')
          AND (
            has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE')
            OR has_table_privilege('anon',c.oid,'DELETE')
            OR has_table_privilege('authenticated',c.oid,'INSERT')
            OR has_table_privilege('authenticated',c.oid,'UPDATE')
            OR has_table_privilege('authenticated',c.oid,'DELETE')
          )
      ),
      'Signed-in clients must not mint balances or forge transactions/gift records'),
    ('stripe_events table', to_regclass('public.stripe_events') IS NOT NULL,
      'Stripe idempotency migration extends the existing event table'),
    ('gift_types table', to_regclass('public.gift_types') IS NOT NULL,
      'Gift transfers use database catalog prices'),
    ('users_coins table', to_regclass('public.users_coins') IS NOT NULL,
      'Gift transfers debit and credit wallet balances'),
    ('paid_shows table', to_regclass('public.paid_shows') IS NOT NULL,
      'Gift patch covers paid shows'),
    ('private profiles source',
      to_regclass('app_private.profiles') IS NOT NULL,
      'The privacy view patch requires app_private.profiles'),
    ('public profiles views',
      to_regclass('public.profiles') IS NOT NULL AND
      to_regclass('public.public_profiles') IS NOT NULL,
      'The frontend uses both private and public profile endpoints'),
    ('Stripe-only history recorded',
      EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
             WHERE version='20260908221940'),
      'Production-only Stripe migration must be reconciled')
),
planned(requirement, is_applied, reason) AS (
  VALUES
    ('Atomic checkout RPC', to_regprocedure('public.credit_stripe_checkout_event(text,text,uuid,integer,text,text)') IS NOT NULL,
      'PR #9 SQL must be applied before stripe-webhook deployment'),
    ('Stripe buy ledger type permitted',
      EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'public.transactions'::regclass
          AND c.conname = 'transactions_type_check'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%''buy''::text%'
      ),
      'Production add_coins writes buy, so the existing 4-type check must be widened first'),
    ('Stripe checkout session key',
      EXISTS(SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stripe_events'
                   AND column_name='checkout_session_id'),
      'Unique checkout session prevents credits from duplicate event IDs'),
    ('Direct-call invitation RPC',
      to_regprocedure('public.create_direct_call(uuid,text)') IS NOT NULL,
      'PR #10 SQL must be applied before direct-call frontend'),
    ('Direct-call acceptance RPC',
      to_regprocedure('public.respond_direct_call(uuid,boolean)') IS NOT NULL,
      'PR #10 SQL must be applied before direct-call frontend'),
    ('Audio/video match type',
      EXISTS(SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='matches'
                   AND column_name='call_type'),
      'Direct-call migration must persist the call type'),
    ('Gift logs reject browser-created rows',
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='gift_logs'
          AND cmd IN ('INSERT','ALL')
          AND ('authenticated' = ANY(roles) OR 'public' = ANY(roles))
      ),
      'Migration _026 removes the old own-sender gift_logs INSERT policy'),
    ('Three private materialized leaderboards',
      NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='m'
          AND c.relname IN ('leaderboard_most_followed','leaderboard_top_streamers',
                            'leaderboard_top_gifters')
          AND (has_table_privilege('anon', c.oid, 'SELECT')
               OR has_table_privilege('authenticated',c.oid,'SELECT'))
      ),
      'PR #14 must revoke materialized-view reads for API roles')
)
SELECT 'baseline' AS phase, requirement,
       CASE WHEN is_ready THEN 'PASS' ELSE 'BLOCKER' END AS status,
       reason
FROM baseline
UNION ALL
SELECT 'planned change', requirement,
       CASE WHEN is_applied THEN 'APPLIED' ELSE 'PENDING' END AS status,
       reason
FROM planned
ORDER BY phase, requirement;
