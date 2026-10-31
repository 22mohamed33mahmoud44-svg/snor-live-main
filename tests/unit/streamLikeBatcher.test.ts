/// <reference lib="deno.ns" />
import { createStreamLikeBatcher } from '../../src/utils/streamLikeBatcher.ts';

function assert(condition: unknown, explanation: string) {
  if (!condition) throw new Error(explanation);
}

Deno.test('successfully writes all accumulated viewer likes as one batch', async () => {
  const written: number[] = [];
  const batcher = createStreamLikeBatcher(async count => {
    written.push(count);
    return true;
  });
  batcher.add();
  batcher.add(2);
  batcher.add();
  assert(batcher.pendingCount() === 4, 'unexpected buffered count');
  assert(await batcher.flush(), 'database batch should succeed');
  assert(written.join(',') === '4' && batcher.pendingCount() === 0,
    'likes were lost or sent as individual RPCs');
});

Deno.test('failed database writes retain the batch for the next timed retry', async () => {
  const written: number[] = [];
  let shouldFail = true;
  const batcher = createStreamLikeBatcher(async count => {
    written.push(count);
    if (shouldFail) return false;
    return true;
  });
  batcher.add(3);
  assert(!(await batcher.flush()), 'failed database RPC was accepted');
  assert(batcher.pendingCount() === 3, 'failed likes were dropped');
  shouldFail = false;
  assert(await batcher.flush(), 'retry should succeed');
  assert(written.join(',') === '3,3' && batcher.pendingCount() === 0,
    'retry did not resend buffered likes');
});

Deno.test('network exceptions retain likes and do not leak rejected promises', async () => {
  let writes = 0;
  const batcher = createStreamLikeBatcher(async () => {
    writes++;
    if (writes === 1) throw new Error('network offline');
    return true;
  });
  batcher.add(2);
  assert(!(await batcher.flush()), 'offline write reported success');
  assert(batcher.pendingCount() === 2, 'offline failure lost likes');
  assert(await batcher.flush(), 'online retry failed');
  assert(writes === 2 && batcher.pendingCount() === 0, 'unexpected number of writes');
});

Deno.test('parallel flushes never create concurrent database writes', async () => {
  let resolve!: (result: boolean) => void;
  const pendingWrite = new Promise<boolean>(resolveFn => { resolve = resolveFn; });
  const calls: number[] = [];
  const batcher = createStreamLikeBatcher(async count => {
    calls.push(count);
    return pendingWrite;
  });
  batcher.add(2);
  const one = batcher.flush();
  const two = batcher.flush();
  batcher.add(3);
  assert(batcher.isFlushing(), 'batch should be in flight');
  // persist executes on the next microtask, after flush has set its lock
  await Promise.resolve();
  assert(calls.join(',') === '2', 'duplicate in-flight write');
  resolve(true);
  assert(await one && await two, 'same RPC should confirm both callers');
  assert(batcher.pendingCount() === 3, 'new likes were lost while waiting');
  // No additional timer is required to send them at teardown.
  assert(await batcher.finish(), 'pending likes should be flushed during teardown');
  assert(calls.join(',') === '2,3', 'buffered likes were not serialized');
});

Deno.test('teardown flushes outstanding likes even after component is closed', async () => {
  const sent: number[] = [];
  const batcher = createStreamLikeBatcher(async count => {
    sent.push(count);
    return true;
  });
  batcher.add(5);
  assert(await batcher.finish(), 'final flush should run at teardown');
  assert(sent.join(',') === '5', 'teardown discarded buffered likes');
  batcher.add(2);
  assert(batcher.pendingCount() === 0, 'closed component must not accept new likes');
});

Deno.test('teardown preserves in-flight and subsequent likes without parallel flush', async () => {
  let finishFirst!: (ok: boolean) => void;
  const first = new Promise<boolean>(resolve => { finishFirst = resolve; });
  const sent: number[] = [];
  const batcher = createStreamLikeBatcher(async count => {
    sent.push(count);
    return sent.length === 1 ? first : true;
  });
  batcher.add(1);
  const inflight = batcher.flush();
  await Promise.resolve();
  batcher.add(4);
  const finishTask = batcher.finish();
  assert(sent.length === 1, 'teardown raced the in-flight write');
  finishFirst(true);
  assert(await inflight && await finishTask, 'last batch did not drain');
  assert(sent.join(',') === '1,4', 'final pending batch was not flushed');
  assert(!batcher.isFlushing(), 'flush lock stayed engaged after completion');
});

Deno.test('invalid or negative like counts are ignored', async () => {
  const batcher = createStreamLikeBatcher(async () => true);
  batcher.add(0);
  batcher.add(-1);
  batcher.add(Number.NaN);
  batcher.add(0.5);
  assert(batcher.pendingCount() === 0, 'invalid counts entered outgoing batch');
});
