import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');
const batcher = readFileSync(new URL('../../src/utils/streamLikeBatcher.ts', import.meta.url), 'utf8');

test('viewer batches likes and retries failed database writes instead of dropping them', () => {
  assert.match(viewer, /import \{ createStreamLikeBatcher \} from /);
  assert.match(viewer, /createStreamLikeBatcher\(async \(count: number\) => \{/);
  assert.match(viewer, /\.rpc\('increment_stream_likes', \{/);
  assert.match(viewer, /increment_count: count/);
  assert.match(viewer, /if \(error\) \{[\s\S]*return false;/);
  assert.match(viewer, /likeBatcher\.add\(\)/);
  assert.match(batcher, /if \(!success\) pending \+= count/);
  assert.doesNotMatch(viewer, /pendingLikesRef\.current = 0/,
    'viewer must not reset likes independently of server acknowledgement');
});

test('component teardown attempts the final batch after stopping the timer', () => {
  assert.match(viewer, /const intervalId = window\.setInterval\(\(\) => \{\s*void likeBatcher\.flush\(\);\s*\}, 2000\)/);
  assert.match(viewer, /window\.clearInterval\(intervalId\);\s*void likeBatcher\.finish\(\)/);
  assert.match(viewer, /\}, \[likeBatcher\]\)/);
  assert.match(batcher, /const running = inFlight;\s*if \(running\) await running;\s*return flush\(\)/);
});

test('Realtime like notice is sent only after persisted count and is nonauthoritative', () => {
  const start = viewer.indexOf('const likeBatcher = useMemo(');
  const end = viewer.indexOf('}), [streamId]);', start);
  assert.ok(start >= 0 && end > start, 'stream like batching implementation not found');
  const logic = viewer.slice(start, end);
  assert.ok(logic.indexOf("supabase.rpc('increment_stream_likes'") <
    logic.indexOf("event: 'like_batch'"), 'broadcast must follow database persistence');
  assert.match(logic, /if \(channelAtFlush && roomChannelRef\.current === channelAtFlush\)/);
  assert.match(logic, /\.send\(\{[\s\S]*?\}\)\.catch\(error =>/);
  assert.match(logic, /return true;/);
  assert.match(logic, /a notification failure must not retry a/);
});
