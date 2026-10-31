import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');
const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');

test('viewer and broadcaster do not overwrite recent likes with stale server snapshots', () => {
  for (const [name, source] of [['viewer', viewer], ['broadcaster', broadcaster]]) {
    assert.match(source, /import \{[^}]*reconcileStreamLikeSnapshot[^}]*\} from ['"][^'"]*streamLikeCounter['"]/,
      `${name}: missing snapshot reconciliation`);
    assert.match(source, /setLikesCount\(current => reconcileStreamLikeSnapshot\(current, data\.likes_count\)\)/,
      `${name}: late likes fetch must merge with current visible count`);
    assert.match(source, /if \(isMounted && data\?\.likes_count != null\)/,
      `${name}: disposed rooms must ignore late like snapshots`);
    assert.doesNotMatch(source, /setLikesCount\(data\.likes_count\)/,
      `${name}: raw snapshot can roll back newer likes`);
  }
});

test('only bounded valid like_batch counts can update the viewer counter or animate hearts', () => {
  assert.match(viewer, /const count = safeStreamLikeBatchCount\(payload\?\.count\)/);
  assert.match(viewer, /if \(count === 0\) return/);
  assert.match(viewer, /setLikesCount\(prev => addStreamLikeBatch\(prev, count\)\)/);
  assert.match(viewer, /const heartsToSpawn = Math\.min\(count, 2\)/);
  assert.match(viewer, /safeTimeout\(\(\) => \{ if \(isMounted\) spawnHeart\(\); \}, i \* 200\)/);
  assert.doesNotMatch(viewer, /payload\?\.count \|\| 1/,
    'invalid or missing broadcast count must not invent a like');
});

test('broadcaster validates both legacy single-like and batched realtime events', () => {
  assert.match(broadcaster, /on\('broadcast', \{ event: 'like' \}, \(\) => \{\s*if \(isMounted\) setLikesCount\(prev => addStreamLikeBatch\(prev, 1\)\)/);
  assert.match(broadcaster, /on\('broadcast', \{ event: 'like_batch' \}, \(\{ payload \}\) => \{\s*if \(isMounted\) setLikesCount\(prev => addStreamLikeBatch\(prev, payload\?\.count\)\)/);
  assert.doesNotMatch(broadcaster, /prev => prev \+ \(payload\?\.count \|\| 1\)/,
    'untrusted payload must not be added directly to displayed counts');
});
