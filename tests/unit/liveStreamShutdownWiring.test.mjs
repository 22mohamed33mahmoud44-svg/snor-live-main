import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const room = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../src/Dashboard.tsx', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../src/utils/endLiveStreamOnServer.ts', import.meta.url), 'utf8');

test('broadcaster never shuts down local media before server confirmation', () => {
  const start = room.indexOf('const endStreamSafely = useCallback(');
  const end = room.indexOf('  // ── الكاميرا', start);
  assert.ok(start >= 0 && end > start, 'endStreamSafely handler missing');
  const handler = room.slice(start, end);
  const confirmation = handler.indexOf('await endLiveStreamOnServer(');
  const stopHeartbeat = handler.indexOf('stopHeartbeat();');
  const stopTracks = handler.indexOf('.getTracks().forEach(track => track.stop());');
  const close = handler.indexOf('onEndStream();');
  assert.ok(confirmation >= 0 && stopHeartbeat > confirmation && stopTracks > confirmation &&
    close > confirmation, 'broadcast shuts down without verified database status');
  assert.match(handler, /if \(endingRef\.current\) return/);
  assert.match(handler, /setEndError\(/, 'database failures need visible retry feedback');
});

test('failed end stays in confirmation modal with a retry path', () => {
  assert.match(room, /<EndStreamModal\b[\s\S]*pending=\{endingStream\}/);
  assert.match(room, /onConfirm=\{\(\) => \{ void endStreamSafely\(\); \}\}/);
  assert.match(room, /role="alert"/);
  assert.match(room, /disabled=\{pending\}/);
});

test('dashboard no longer issues a duplicate unverified end update', () => {
  const start = dashboard.indexOf('onEndStream={() => setActiveLiveStream(null)}');
  assert.ok(start >= 0, 'dashboard should close UI only after confirmed end');
  assert.doesNotMatch(dashboard, /onEndStream=\{async \(\) => \{\s*await supabase\.from\('live_streams'\)/);
  assert.match(helper, /\.eq\('user_id', ownerId\)/);
  assert.match(helper, /\.eq\('is_live', true\)/);
  assert.match(helper, /\.select\('is_live'\)/, '0-row updates must verify current server status');
});
