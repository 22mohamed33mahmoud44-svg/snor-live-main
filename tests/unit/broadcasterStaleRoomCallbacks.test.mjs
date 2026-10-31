import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const room = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');

test('broadcaster LiveKit rooms and publishers capture unique attempt IDs', () => {
  assert.match(room, /const roomAttemptId = `\$\{streamId\}-\$\{connectionAttempt\}`/);
  assert.match(room, /const activeRoomAttemptRef = useRef\(roomAttemptId\)/);
  assert.match(room, /activeRoomAttemptRef\.current = roomAttemptId/);
  assert.match(room, /key=\{roomAttemptId\}/);
  assert.match(room, /onError=\{\(error\) => handleMediaFailure\(roomAttemptId, error\)\}/);
  assert.match(room, /onPublished=\{onPublishedForAttempt\}/);
  assert.match(room, /onPublishError=\{onPublishErrorForAttempt\}/);
  assert.match(room, /handleMediaFailure\(roomAttemptId, new Error\('Broadcaster disconnected from LiveKit'\)\)/);
});

test('old room success and failure callbacks cannot mutate a new broadcaster attempt', () => {
  for (const handler of ['handleMediaPublished', 'handleMediaFailure']) {
    const begin = room.indexOf(`  const ${handler} = useCallback(`);
    const end = room.indexOf('  }, []);', begin);
    assert.ok(begin >= 0 && end > begin, `${handler} declaration missing`);
    const body = room.slice(begin, end);
    assert.match(body, /activeRoomAttemptRef\.current !== attemptId \|\| endingRef\.current/,
      `${handler} must ignore previous room and stream-shutdown callbacks`);
    const firstStateChange = body.search(/setMediaPublished\(|setLiveKitError\(/);
    assert.ok(firstStateChange > body.indexOf('activeRoomAttemptRef.current !== attemptId'),
      `${handler} changes state before checking attempt`);
  }
  assert.doesNotMatch(room, /ignoreDisconnectRef/,
    'shared disconnect suppression flag can be re-enabled before old callbacks settle');
});

test('retry invalidates stale publisher and websocket callbacks before room teardown', () => {
  const begin = room.indexOf('  const retryMediaConnection = useCallback(');
  const end = room.indexOf('  // ── Heartbeat ──', begin);
  assert.ok(begin >= 0 && end > begin, 'retry callback missing');
  const retry = room.slice(begin, end);
  const invalidate = retry.indexOf('activeRoomAttemptRef.current =');
  const unmount = retry.indexOf('setLiveKitToken(null)');
  assert.ok(invalidate >= 0 && unmount > invalidate,
    'must invalidate old room before unmounting it');
  assert.match(retry, /setConnectionAttempt\(attempt => attempt \+ 1\)/);
  assert.match(retry, /\[initialStream, cameraReady, streamId, connectionAttempt\]/);
});

test('late publish watchdog timeout cannot report a failure for a newer attempt', () => {
  const start = room.indexOf('// Waiting for a token, a WebSocket, or a track publish must be bounded.');
  const end = room.indexOf('  const retryMediaConnection =', start);
  const watchdog = room.slice(start, end);
  assert.match(watchdog, /activeRoomAttemptRef\.current !== roomAttemptId \|\| endingRef\.current/);
  assert.match(watchdog, /window\.clearTimeout\(watchdog\)/);
  assert.match(watchdog, /\[liveKitToken, mediaPublished, liveKitError, roomAttemptId\]/);
});

test('publisher callback identities stay stable across unrelated broadcaster renders', () => {
  assert.match(room, /const onPublishedForAttempt = useCallback\(\(\) => \{/);
  assert.match(room, /handleMediaPublished\(roomAttemptId\)/);
  assert.match(room, /\}, \[handleMediaPublished, roomAttemptId\]\)/);
  assert.match(room, /const onPublishErrorForAttempt = useCallback\(\(error: Error\) => \{/);
  assert.match(room, /handleMediaFailure\(roomAttemptId, error\)/);
  assert.match(room, /\}, \[handleMediaFailure, roomAttemptId\]\)/);
  assert.match(room, /onPublished=\{onPublishedForAttempt\}/);
  assert.match(room, /onPublishError=\{onPublishErrorForAttempt\}/);
  assert.doesNotMatch(room, /onPublished=\{\(\) => handleMediaPublished\(/,
    'inline published callback would unpublish/re-publish on uptime re-render');
});
