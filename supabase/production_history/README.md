# Production Supabase migration source archive (read-only recovery)

Recovered on 2026-10-30 from **the actual statement bodies** recorded in production Supabase project `ogzrothtgxupawgjbioc`, table `supabase_migrations.schema_migrations`.

**CRITICAL: archival reference only. These files are NOT in `supabase/migrations`. Do not apply, replay, or move this history into an active migrations directory.** The production database already records these 32 versions as applied, and the repository contains a diverging 2026-08-20 through 2026-09-01 chain. Replaying these historical scripts can overwrite grants, database functions, or user data.

- Contains exactly **32 production-only timestamp versions**, from `20260822011814` through `20260908221940` (31 August security/repair versions and one September Stripe migration).
- Each `.sql` file preserves **the one SQL statement body saved for its version**. No SQL was executed during recovery.
- `manifest.json` records database-calculated MD5 and character length for each body; use them to detect accidental changes, not as proof of security.
- The earlier four common versions are already represented in source control and are not duplicated here.
- Full release sequencing and remaining blockers: [Migration Reconciliation](../MIGRATION_RECONCILIATION.md).

**Next steps:** independently compare archived SQL with repo migration chain and live schema, prepare a schema-compatible staging database, and establish a reviewed forward-only migration baseline. The archive alone does not reconcile or authorize deployment.
