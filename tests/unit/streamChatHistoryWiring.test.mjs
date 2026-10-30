import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');
const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');

test('viewer and broadcaster fetch newest history and merge with already arrived messages', () => {
  for (const [who, source] of [['viewer', viewer], ['broadcaster', broadcaster]]) {
    assert.match(source, /import \{ mergeStreamChatHistory \} from /, `${who} missing merge utility`);
    assert.match(source,
      /\.from\('stream_chat'\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)\.limit\(MESSAGES_LIMIT\)/,
      `${who} should request latest messages rather than the oldest`);
    assert.match(source, /data\.slice\(\)\.reverse\(\)\.map\(/,
      `${who} should display the latest window in chronological order`);
    assert.match(source, /set(?:Chat)?Messages\(current => mergeStreamChatHistory\(recentHistory, current, MESSAGES_LIMIT\)\)/,
      `${who} must not overwrite new realtime messages with a late history response`);
    assert.match(source, /created_at: m\.created_at/,
      `${who} missing server timestamp for ordering across reconnections`);
  }
});

test('both history effects ignore responses after cleanup', () => {
  assert.match(viewer, /if \(data && isMounted\)/);
  assert.match(viewer, /isMounted = false/);
  assert.match(broadcaster, /if \(!isMounted \|\| !data\) return/);
  assert.match(broadcaster, /isMounted = false;\s*stopHeartbeat\(\)/);
});

test('Realtime delivered messages retain timestamps and are not duplicated by history', () => {
  assert.match(viewer, /created_at\?: string/);
  assert.match(broadcaster, /created_at\?: string/);
  assert.match(broadcaster, /created_at: newMsg\.created_at/);
  assert.match(viewer, /prev\.some\(m => m\.id === newMsg\.id\)/);
});
