// Read-only Git archive integrity verification. Never execute archived SQL.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

const root = resolve('supabase/production_history');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.archival_only !== true || manifest.count !== 32 ||
    !Array.isArray(manifest.migrations) || manifest.migrations.length !== 32) {
  throw new Error('Production SQL archive must have exactly 32 archival-only entries');
}
const expected = new Set();
let previousVersion = '';
for (const migration of manifest.migrations) {
  const { version, name, md5, chars, path } = migration;
  if (!/^\d{14}$/.test(version) || !/^[a-z0-9_]+$/.test(name) ||
      !/^[a-f0-9]{32}$/.test(md5) || !Number.isInteger(chars) || chars <= 0 ||
      version <= previousVersion) {
    throw new Error('Invalid or unsorted production migration manifest: ' + version);
  }
  const expectedPath = 'supabase/production_history/' + version + '_' + name + '.sql';
  if (path !== expectedPath || expected.has(path)) {
    throw new Error('Unexpected or duplicate production SQL filename: ' + path);
  }
  expected.add(path);
  previousVersion = version;
  const absolute = resolve(path);
  if (!absolute.startsWith(root + sep)) throw new Error('Archive path escaped: ' + path);
  const content = readFileSync(absolute, 'utf8');
  const actualDigest = createHash('md5').update(content, 'utf8').digest('hex');
  if (actualDigest !== md5 || Array.from(content).length !== chars) {
    throw new Error('Production SQL body changed or truncated: ' + path);
  }
}
const actual = readdirSync(root).filter(x => x.endsWith('.sql'));
if (actual.length !== expected.size ||
    actual.some(x => !expected.has('supabase/production_history/' + x))) {
  throw new Error('Archive contains missing or unexpected SQL files');
}
console.log('Recovered production migration archive integrity verified: 32 exact statement bodies');
