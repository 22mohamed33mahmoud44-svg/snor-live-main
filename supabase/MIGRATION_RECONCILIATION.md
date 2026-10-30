# Supabase Migration Reconciliation

## Current state

Production project `ogzrothtgxupawgjbioc` currently reports **36 applied migrations** (verified 2026-10-30).

The repository `main` branch currently contains **18 timestamped migration files** plus the legacy marker `001_coins_system.sql`.

The first four timestamped versions are present in both Production and the repository:

- `20260723064545` — `001_coins_system`
- `20260723075755` — `005_fix_schema_alignment`
- `20260819003311` — `ensure_live_stream_cleanup`
- `20260819003623` — `restore_batched_stream_likes`

Production then has a separate security/repair chain starting at `20260822011814` and ending at `20260822205256` (31 additional production migrations), followed by a Stripe payment migration on 2026-09-08 (one more production migration).

Production also contains **`20260908221940` — `019_stripe_only_payments`**, which is absent from `main`. It must be recovered or otherwise reconciled before replaying migration history.

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
20260908221940 019_stripe_only_payments
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

## Release coordination after 2026-10-30 audit

The following independent draft PRs contain proposed changes **not yet applied** to the live database or released to production:

| PR | Area | Backend requirement |
| --- | --- | --- |
| #9 | Atomic Stripe credits | Run and validate Stripe credit RPC migration, then deploy the updated `stripe-webhook` Edge Function |
| #10 | Authorized LiveKit direct calls | Run invitation/match SQL migration, then deploy `livekit-token` Edge Function and its corresponding frontend |
| #11 | Canonical gift pricing | Apply gift accounting SQL only after verifying paid-show bundles and testing live catalog prices |
| #12 | Profile privacy | Carefully stage owner-only profile and public discovery view permissions; coordinate with frontend and LiveKit function |
| #13 | Anonymous RPC permissions | Test and apply restricted EXECUTE grants for user-specific RPCs |
| #14 | Leaderboard materialized view permissions | Revoke direct Data API access for 3 materialized views; preserve service-role access |

**Do not merge all PR branches independently and assume the result is deployable.** #10 and #12 both modify the `src/Dashboard.tsx` and `supabase/functions/livekit-token/index.ts` paths. Integration must resolve those overlaps and rerun every SQL test on one combined candidate.

### Stripe ledger type blocker confirmed in Production (2026-10-30)

A read-only production schema audit established a release-blocking mismatch:

- `public.add_coins(uuid,integer,jsonb)` writes `public.transactions.type = 'buy'` for Stripe coin purchases.
- The **validated production** `transactions_type_check` only allows `spend`, `earn`, `bonus`, or `refund` — it excludes `buy`. The separate amount-direction check *does* already allow positive `buy`.
- Consequently, the current production `add_coins` purchase path cannot commit its buy ledger entry. Since the RPC is transactional, any credit should roll back; this must not be mistaken for a Stripe payment failure.
- Integration PR #16 now expands **only** the known, existing transaction-type constraint in `20261030000000_020_atomic_stripe_checkout_credit.sql` before creating the atomic checkout RPC. The SQL fails closed on an unknown constraint definition rather than blindly removing enforcement.
- Both the isolated checkout test and the combined Stripe-funded gifts test reproduce the original 4-type constraint, then apply the proposed migration and require valid `buy` ledger entries. The live schema check `supabase/release/preflight_readonly.sql` reports this missing capability as `PENDING`.

**Release order:** after migration reconciliation, back up/verify the ledger schema, rehearse the scoped constraint change on a schema-compatible staging clone, apply the Stripe SQL before deploying `stripe-webhook`, and confirm a Stripe test-mode checkout creates exactly one `buy` ledger row. Do not repair Stripe errors by writing coin balances directly or removing transaction constraints altogether.

### Stripe webhook purchased-price verification

PR #16 additionally makes the Stripe webhook retrieve the paid Checkout
Session's line items from Stripe before crediting any wallet. It requires the
configured Stripe Price ID for the claimed coin package, exactly one purchased
item/quantity, a positive amount without an underpriced discount, and a
matching authenticated buyer reference when present. The webhook returns a
retryable 500 if Stripe lookup fails or a paid order cannot be verified; it
does **not** mint coins from unverified metadata alone.

**Before deployment**, ensure both Supabase Edge Functions use identical
`STRIPE_PRICE_100_COINS`, `STRIPE_PRICE_500_COINS`, and
`STRIPE_PRICE_1000_COINS` secrets for the matching Stripe account. Do not
log or expose the secret values. Check for valid **in-flight paid sessions**
created with an older Price ID before rotating prices or deploying the
verification check. A previously valid checkout whose Price ID no longer
matches the configured allowlist will be held for manual reconciliation
rather than credited automatically. Test a webhook replay, an invalid
price, a failed Stripe line-item lookup, and a real test-mode purchase.

### Safe promotion checklist

1. Obtain an off-production database or an isolated schema-compatible clone and establish a reliable schema baseline; do not reset or run `db push` against the live database while histories differ.
2. Reconcile the 31 August 22 production-only migration versions and the September 8 Stripe migration from a trusted backup, prior Git history, or the original deployment source. Compare schema objects rather than assuming same names mean same SQL.
3. Prepare a combined integration branch preserving the call-auth changes, the profile-discovery query updates, and the payment/gift policies. Run existing TypeScript/build checks and each isolated PostgreSQL test suite against its feature changes, then validate cross-feature behavior.
4. Run staging account-level acceptance tests with at least two test users: signup/profile edits, chat, calls (pending/accepted/declined/ended), gift and paid show accounting, Stripe sandbox webhook replay and retries.
5. Apply reviewed SQL to staging and validate Supabase Advisors and privileges. Explicitly review `SECURITY DEFINER` view and function findings that still remain.
6. After an approved production maintenance plan and a tested rollback/restore path exist, apply compatible forward SQL in the correct order. Coordinate any changed Edge Functions with their frontend versions. Vercel preview build success does not validate Edge Function deployment.
7. Validate payment idempotency and wallet ledger, run live smoke checks, then promote the tested frontend release and monitor Supabase and Vercel. If any migration fails, stop rather than replaying the whole migration directory.

No automated production release is authorized by this document.
