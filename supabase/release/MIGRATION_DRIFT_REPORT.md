# Production migration drift audit — read-only snapshot (2026-10-30)

The baseline records migration versions, names, hashes and character counts from `supabase_migrations.schema_migrations`; it contains **no SQL to execute** and no customer data.

| Category | Count |
| --- | ---: |
| Applied on Supabase production | 36 |
| Timestamped migration SQL files on integration branch | 23 |
| Matching migration versions (NOT necessarily identical SQL) | 4 |
| Production-only SQL recovered in archival folder | 32 |
| Repo-only versions timestamped **before or at** production latest | 15 |
| Repo-only versions timestamped **after** production latest | 7 |

Latest production migration: `20260908221940`.

## Historical repo files absent from applied history
- `20260723064616_002_core_schema.sql`
- `20260723064639_003_live_streaming.sql`
- `20260820000000_006_sync_db_to_repo.sql`
- `20260821000000_007_phase1_fixes.sql`
- `20260822000000_008_phase2_features.sql`
- `20260823000000_009_phase3_performance.sql`
- `20260824000000_010_phase4_growth.sql`
- `20260825000000_011_phase5_admin.sql`
- `20260826000000_012_phase6_messages_unification.sql`
- `20260827000000_013_phase7_paid_shows.sql`
- `20260828000000_014_phase8_missions_boost.sql`
- `20260829000000_015_phase9_vip_agents_analytics.sql`
- `20260830000000_016_phase10_catalog_config.sql`
- `20260831000000_017_final_fixes.sql`
- `20260901000000_018_storage_avatars.sql`

## Newer repository files absent from applied history
- `20260909000000_019_stripe_only_payments.sql`
- `20261030000000_020_atomic_stripe_checkout_credit.sql`
- `20261030010000_021_secure_direct_calls.sql`
- `20261030020000_022_validate_gift_catalog_prices.sql`
- `20261030030000_023_owner_profile_privacy.sql`
- `20261030040000_024_restrict_anonymous_rpc_execute.sql`
- `20261030050000_025_protect_leaderboard_materialized_views.sql`

## Same-version SQL body comparison
- `20260723064545`: not byte-identical; production stores 55 statements, repository a single SQL source.
- `20260723075755`: not byte-identical; production stores 16 statements, repository a single SQL source.
- `20260819003311`: contents match after trimming whitespace.
- `20260819003623`: identical raw text.

**Release blocker:** the active migration history remains divergent. Do not assume identical versions imply identical SQL; do not run `db push`, `migration repair`, or replay these scripts against production as a shortcut.

Run `node scripts/report-migration-drift.mjs --report` to produce an up-to-date **local-file comparison against the frozen snapshot**. Before deployment, refresh the snapshot from production using read-only SQL and rehearse forward migrations on a separate clone.
