/// <reference lib="deno.ns" />
import {
  reconcileStreamLikeSnapshot,
  safeStreamLikeBatchCount,
  addStreamLikeBatch,
} from '../../src/utils/streamLikeCounter.ts';

function assert(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
}

Deno.test('older database snapshots never reset newer optimistic or realtime counts', () => {
  assert(reconcileStreamLikeSnapshot(120, 100) === 120, 'stale DB snapshot decreased likes');
  assert(reconcileStreamLikeSnapshot(120, 121) === 121, 'new DB count should increase displayed likes');
  assert(reconcileStreamLikeSnapshot(0, 420) === 420, 'initial server count not accepted');
  assert(reconcileStreamLikeSnapshot(3, 0) === 3, 'late empty snapshot reset new local taps');
});

Deno.test('malformed snapshots are ignored rather than displayed as likes', () => {
  for (const value of [-1, 2.5, NaN, Infinity, '100', null, undefined, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert(reconcileStreamLikeSnapshot(55, value) === 55,
      'untrusted server snapshot corrupted displayed likes');
  }
});

Deno.test('like broadcasts require bounded positive integer counts', () => {
  for (const value of [-1, 0, 2.5, NaN, Infinity, '3', null, undefined, {}, 5001, 99999999]) {
    assert(safeStreamLikeBatchCount(value) === 0,
      'non-integer, negative or unreasonably large batch must be ignored');
  }
  assert(safeStreamLikeBatchCount(1) === 1, 'single valid like rejected');
  assert(safeStreamLikeBatchCount(5000) === 5000, 'bounded valid batch rejected');
});

Deno.test('malformed broadcast payloads never turn visible counter negative or into a string', () => {
  assert(addStreamLikeBatch(30, '9') === 30, 'string payload concatenated to like count');
  assert(addStreamLikeBatch(30, -100) === 30, 'negative payload reduced like count');
  assert(addStreamLikeBatch(30, 4) === 34, 'valid broadcast ignored');
  assert(addStreamLikeBatch(Number.MAX_SAFE_INTEGER - 1, 5) === Number.MAX_SAFE_INTEGER,
    'large counter overflowed safe integer');
});
