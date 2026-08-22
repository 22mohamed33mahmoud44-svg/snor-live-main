/*
# Fix Transactions Table for Xsolla Webhook

The Xsolla webhook edge function inserts into `transactions` with columns
`status`, `provider`, and `provider_txn_id` that don't exist in the original
schema. This migration adds them and creates a unique index on
`provider_txn_id` for idempotency (prevents double-crediting on webhook
retries — the webhook relies on a 23505 unique violation to detect duplicates).

## Changes to `transactions` table
1. `status` (TEXT, default 'success') — payment status
2. `provider` (TEXT) — payment provider name (xsolla, paymob, stripe)
3. `provider_txn_id` (TEXT) — external transaction ID for idempotency

## New Index
- Unique index on `provider_txn_id` — ensures one coin credit per external transaction

## Security
- No policy changes (table already has SELECT-only RLS for own data)
*/

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_txn_id TEXT;

-- Unique index for idempotency: the Xsolla webhook relies on a 23505
-- unique violation to detect already-processed transactions.
-- Partial index: only enforce uniqueness when provider_txn_id is set
-- (rows from the original coin RPCs don't have it).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_txn_unique
  ON transactions (provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;