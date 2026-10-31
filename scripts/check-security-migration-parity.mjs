// Guard migration SOURCE parity without executing SQL or connecting to a DB.
// PostgreSQL CI tests apply the real migration files, not review-only patches.
import { readFileSync, readdirSync } from 'node:fs';
const pairs = [
  ['20261030_profile_privacy.sql','20261030030000_023_owner_profile_privacy.sql'],
  ['20261030_anon_rpc_execute.sql','20261030040000_024_restrict_anonymous_rpc_execute.sql'],
  ['20261030_private_leaderboard_materialized_views.sql','20261030050000_025_protect_leaderboard_materialized_views.sql'],
];
for (const [patch, migration] of pairs) {
  const patchBody = readFileSync('supabase/security_patches/' + patch, 'utf8');
  const migrationBody = readFileSync('supabase/migrations/' + migration, 'utf8');
  if (patchBody !== migrationBody) {
    throw new Error('Security patch and executable migration differ: ' + migration);
  }
}
const active = new Set(readdirSync('supabase/migrations'));
if (pairs.some(([, name]) => !active.has(name))) {
  throw new Error('Required security migration omitted from active directory');
}
console.log('Three security patches exactly match their tested, executable migrations.');
