// Offline deployment-history guard. Reads local files only; never touches
// production or executes archived SQL. Run on pull requests and before release.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const inventory = JSON.parse(readFileSync(resolve('supabase/release/production_migration_inventory.json'), 'utf8'));
const archive = JSON.parse(readFileSync(resolve('supabase/production_history/manifest.json'), 'utf8'));
const production = inventory.production_migrations;
const active = readdirSync(resolve('supabase/migrations'))
  .filter(f => f.endsWith('.sql') && /^\d{14}_.*\.sql$/.test(f))
  .sort()
  .map(file => ({version:file.slice(0,14),file}));

const unique = values => new Set(values).size === values.length;
const remoteVersions = production.map(p => p.version);
const localVersions = active.map(p => p.version);
if (!unique(remoteVersions) || !unique(localVersions) ||
    remoteVersions.length !== 36 || archive.count !== 32) {
  throw new Error('Unexpected production migration baseline, duplicate version, or broken archive');
}
if (remoteVersions.some((version,i) => i && version <= remoteVersions[i-1])) {
  throw new Error('Production version snapshot is not strictly sorted');
}

const applied = new Set(remoteVersions), local = new Set(localVersions);
const shared = active.filter(p => applied.has(p.version));
const onlyProduction = production.filter(p => !local.has(p.version));
const onlyLocal = active.filter(p => !applied.has(p.version));
const latestApplied = remoteVersions.at(-1);
const historical = onlyLocal.filter(p => p.version <= latestApplied);
const future = onlyLocal.filter(p => p.version > latestApplied);
const acceptedHistorical = [...inventory.known_historical_local_unapplied].sort();
const currentHistorical = historical.map(p => p.version).sort();

if (onlyProduction.length !== archive.migrations.length ||
    onlyProduction.some(p => !archive.migrations.some(a =>
      a.version === p.version && a.md5 === p.recorded_md5 &&
      a.chars === p.recorded_chars && a.name === p.name))) {
  throw new Error('Production-only history and recovered SQL archive disagree');
}
if (JSON.stringify(currentHistorical) !== JSON.stringify(acceptedHistorical)) {
  throw new Error('Historical migration divergence changed: reconcile before accepting new changes');
}

const output = [
  '# Production migration drift audit',
  '',
  'Snapshot: ' + inventory.captured_date + '; read-only catalog export. This report is **not live**.',
  '',
  '| Category | Count |',
  '| --- | ---: |',
  '| Applied in production | ' + production.length + ' |',
  '| Active repo SQL files | ' + active.length + ' |',
  '| Same-version entries | ' + shared.length + ' |',
  '| Production only (archived) | ' + onlyProduction.length + ' |',
  '| Repo only, historically earlier than production head | ' + historical.length + ' |',
  '| Repo only, after production head | ' + future.length + ' |',
  '',
  '## Older repository versions missing from production history',
  ...historical.map(p => '- \`' + p.file + '\`'),
  '',
  '## Later repository versions not applied to production',
  ...future.map(p => '- \`' + p.file + '\`'),
  '',
  '## Shared-version SQL comparison from read-only audit',
  ...inventory.known_shared_text_comparison.map(p =>
    '- \`' + p.version + '\`: ' + p.comparison + ' — ' + p.note),
  '',
  '**BLOCKER:** do not replay, automatically repair, or push the divergent migration directory to production.',
  'Use the recovery archive as reference, reconcile schema on an off-production clone,',
  'and refresh this snapshot against current production state before an approved release.',
  '',
].join('\n');
if (process.argv.includes('--report')) process.stdout.write(output);
else console.log('Historical drift matches known baseline: ' +
  historical.length + ' old repo-only, ' + future.length + ' newer pending, ' +
  onlyProduction.length + ' archived production-only. Release still blocked.');
