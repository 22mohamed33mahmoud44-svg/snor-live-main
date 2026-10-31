// Offline release guard: verify the SQL bodies saved in the 2026-10-31 live
// database correspond exactly to reviewed repository sources. This does NOT
// reconcile the older migration ledger and does NOT connect to production.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const addendum = JSON.parse(readFileSync('supabase/release/live_forward_patch_addendum_20261031.json', 'utf8'));
const baseline = JSON.parse(readFileSync('supabase/release/production_migration_inventory.json', 'utf8'));
const migrations = addendum.forward_applied;
if (baseline.production_migrations.length !== 36 ||
    addendum.baseline_applied_count !== 36 ||
    addendum.live_applied_count_after_patches !== 42 ||
    migrations.length !== 6) {
  throw new Error('Unexpected live migration audit counts; repeat a read-only catalog check.');
}
const versions = migrations.map(x => x.applied_version);
if (new Set(versions).size !== 6 ||
    versions.some((version, i) => i > 0 && version <= versions[i-1])) {
  throw new Error('Duplicate or unsorted applied forward patch version.');
}
const expectedSource = new Set([
  '20261030010000_021_secure_direct_calls.sql',
  '20261030020000_022_validate_gift_catalog_prices.sql',
  '20261030030000_023_owner_profile_privacy.sql',
  '20261030040000_024_restrict_anonymous_rpc_execute.sql',
  '20261030050000_025_protect_leaderboard_materialized_views.sql',
  '20261030060000_026_lock_financial_table_writes.sql',
]);
for (const patch of migrations) {
  if (!patch.source_path.startsWith('supabase/migrations/') ||
      !expectedSource.delete(patch.source_path.slice('supabase/migrations/'.length))) {
    throw new Error('Unreviewed or duplicate forward-patch source: ' + patch.source_path);
  }
  const body = readFileSync(patch.source_path, 'utf8');
  const md5 = createHash('md5').update(body, 'utf8').digest('hex');
  const charCount = Array.from(body).length; // matches PostgreSQL character count
  if (md5 !== patch.recorded_md5 || charCount !== patch.recorded_chars) {
    throw new Error('Live forward patch differs from reviewed SQL: ' + patch.source_path);
  }
}
if (expectedSource.size) throw new Error('Expected forward patches missing from addendum.');
console.log('6 verified live forward patch hashes; 42 applied versions recorded in addendum. Historical migration drift remains unresolved.');
