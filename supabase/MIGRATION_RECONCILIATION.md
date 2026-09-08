# Supabase Migration Reconciliation

## Current state

Production project `ogzrothtgxupawgjbioc` currently reports **35 applied migrations**.

The repository `main` branch currently contains **18 timestamped migration files** plus the legacy marker `001_coins_system.sql`.

The first four timestamped versions are present in both Production and the repository:

- `20260723064545` — `001_coins_system`
- `20260723075755` — `005_fix_schema_alignment`
- `20260819003311` — `ensure_live_stream_cleanup`
- `20260819003623` — `restore_batched_stream_likes`

Production then has a separate security/repair chain starting at `20260822011814` and ending at `20260822205256` (32 additional production migrations).

The repository instead has timestamped migrations from `20260820000000` through `20260901000000` for the feature/phase work in the current codebase.

## Why this matters

The error `Remote migration versions not found in local migrations directory` is consistent with Production containing migration versions that are not represented by files in the checked-in repository.

The repository must **not** attempt to replay the full migration history against Production. In particular, migrations touching coin balances, payment state, RLS, grants, RPCs, identity relations, or storage can be destructive or can conflict with the already-applied Production state.

## Production-only chain that must be preserved

The following versions are currently recorded in Production but are not represented by same-version files on `main`:

```text
20260822011814 harden_security_and_fix_schema_20260822
20260822012000 repair_paymob_payment_state_20260822
20260822012135 repair_xsolla_payment_state_20260822
20260822012327 provider_transaction_idempotency_20260822
20260822012342 explicit_server_only_payment_event_policies_20260822
20260822012809 remove_all_payment_gateway_database_objects_20260822
20260822013341 normalize_identity_types_and_message_policies_v2_20260822
20260822013409 tighten_profile_and_view_grants_20260822
20260822013414 harden_profile_public_read_surface_20260822
20260822013441 least_privilege_table_grants_and_policies_20260822
20260822013515 remove_obsolete_chat_no_update_policy_20260822
20260822013541 index_foreign_keys_and_reduce_security_definer_surface_20260822
20260822013823 fix_stream_gift_accounting_batched_likes_and_matchmaking_20260822
20260822013949 move_privileged_rpc_logic_to_private_schema_20260822
20260822014218 harden_avatar_storage_bucket_v2_20260822
20260822014303 normalize_profile_date_and_utc_timestamps_20260822
20260822014401 complete_referential_integrity_and_delete_semantics_20260822
20260822014513 repair_signup_coin_balances_and_ledger_20260822
20260822014539 gracefully_end_matches_before_auth_user_delete_20260822
20260822014608 cleanup_signals_when_match_ends_20260822
20260822014804 mask_private_profile_fields_without_frontend_breakage_20260822
20260822015045 close_direct_write_escalation_paths_20260822
20260822015126 make_profile_identity_authoritative_for_streams_and_chat_20260822
20260822015207 bound_user_generated_content_and_metadata_20260822
20260822015238 restore_like_rpc_compatibility_and_rate_limit_20260822
20260822015600 index_private_like_rate_stream_fk_20260822
20260822015727 harden_background_maintenance_functions_20260822
20260822015929 hide_internal_rpc_errors_20260822
20260822020056 enforce_nonnull_relations_and_server_heartbeat_20260822
20260822020209 lock_private_schema_default_privileges_20260822
20260822205256 sync_storage_buckets_and_policies_20260822
```

## Git history evidence

Git history contains the original Migration 017/018 work around 2026-08-22. The Migration 018 fix specifically added `DROP POLICY IF EXISTS` before storage policy creation, showing that this history was part of the repository at that point.

The current `20260901000000_018_storage_avatars.sql` is the later storage migration in the active branch and should not be assumed equivalent to Production migration `20260822205256` without a schema-level comparison.

## Safe reconciliation procedure

1. Treat Production schema and migration history as the operational source of truth.
2. Recover the exact SQL for Production-only migrations from Git history, backups, or the original deployment source when available.
3. Compare those SQL changes with the current repository migrations and the live schema.
4. Do not create fake/empty migration files for Production-only versions.
5. Do not reset Production to repair migration history.
6. After the schema has been reconciled, establish one clean forward migration baseline for future development.
7. Verify payment, coins, RLS, RPC permissions, storage policies, and background jobs after reconciliation.

## Current conclusion

**Migration status: DRIFTED / NOT REPRODUCIBLE FROM CURRENT `main`.**

Production is ahead of the checked-in repository and contains a security hardening chain whose exact SQL is not currently represented by same-version migration files on `main`.

This document records the mismatch so future deploy tooling does not try to replay the current repository chain blindly against Production.
