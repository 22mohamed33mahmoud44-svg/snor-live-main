import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');

test('each viewer room captures its own connection attempt identity', () => {
  assert.match(viewer, /const roomAttemptId = `\$\{streamId\}-\$\{myUsername\}-\$\{connectionAttempt\}`/);
  assert.match(viewer, /const activeRoomAttemptRef = useRef\(roomAttemptId\)/);
  assert.match(viewer, /activeRoomAttemptRef\.current = roomAttemptId/);
  assert.match(viewer, /key=\{roomAttemptId\}/);
  assert.match(viewer, /onConnected=\{\(\) => handleMediaConnected\(roomAttemptId\)\}/);
  assert.match(viewer, /onDisconnected=\{\(\) => handleMediaDisconnected\(roomAttemptId\)\}/);
  assert.match(viewer, /onError=\{\(error\) => handleMediaError\(roomAttemptId, error\)\}/);
});

test('old connected/disconnected/error events cannot alter the next attempt', () => {
  for (const label of ['handleMediaConnected', 'handleMediaDisconnected', 'handleMediaError']) {
    const start = viewer.indexOf(`  const ${label} = useCallback(`);
    const end = viewer.indexOf('  }, []);', start);
    assert.ok(start >= 0 && end > start, `${label} missing`);
    const callback = viewer.slice(start, end);
    assert.match(callback, /if \(activeRoomAttemptRef\.current !== attemptId\) return;/,
      `${label} must reject old room callbacks`);
    const guard = callback.indexOf('if (activeRoomAttemptRef.current !== attemptId) return;');
    const stateChange = callback.search(/setMediaConnected\(|setConnectionError\(/);
    assert.ok(guard >= 0 && (stateChange === -1 || guard < stateChange),
      `${label} mutated connection state before checking attempt`);
  }
});

test('retry invalidates the old room before it is allowed to disconnect', () => {
  const start = viewer.indexOf('  const retryConnection = useCallback(');
  const end = viewer.indexOf('  }, [streamId, myUsername, connectionAttempt]);', start);
  assert.ok(start >= 0 && end > start, 'retryConnection closure missing');
  const retry = viewer.slice(start, end);
  const invalidation = retry.indexOf('activeRoomAttemptRef.current =');
  const unmountToken = retry.indexOf('setLiveKitToken(null)');
  assert.ok(invalidation >= 0 && unmountToken > invalidation,
    'old room must be invalidated synchronously before teardown');
  assert.match(retry, /setConnectionAttempt\(attempt => attempt \+ 1\)/);
  assert.doesNotMatch(viewer, /suppressDisconnectRef/,
    'one shared disconnect boolean can be reset by the new token and accept old events');
});

test('token fetch cancellation still ignores late previous-attempt responses', () => {
  assert.match(viewer, /if \(isCancelled\) return;/);
  assert.match(viewer, /\[streamId, myUsername, connectionAttempt\]/);
  assert.match(viewer, /window\.clearTimeout\(tokenTimeout\)/);
});
