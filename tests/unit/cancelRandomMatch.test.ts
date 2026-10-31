/// <reference lib="deno.ns" />
import { cancelRandomSearchAfterPending, finishCanceledRandomMatch } from '../../src/utils/cancelRandomMatch.ts';

function assert(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
}

Deno.test('canceling a random match ends only the selected active random call', async () => {
  const ended: string[] = [];
  const ok = await finishCanceledRandomMatch(
    { id: 'random-123', kind: 'random', status: 'active' },
    async (id) => { ended.push(id); return true; },
  );
  assert(ok, 'random match should finish');
  assert(ended.length === 1 && ended[0] === 'random-123', 'wrong match was ended');
});

Deno.test('direct calls, ended matches and unknown types cannot be terminated by random cancel', async () => {
  let count = 0;
  const endMatch = async (_id: string) => { count += 1; return true; };
  for (const match of [
    { id: 'direct-123', kind: 'direct', status: 'active' },
    { id: 'random-old', kind: 'random', status: 'ended' },
    { id: 'random-pending', kind: 'random', status: 'pending' },
    { id: 'unknown', status: 'active' },
    { id: '', kind: 'random', status: 'active' },
  ]) {
    assert(!(await finishCanceledRandomMatch(match, endMatch)), 'unexpected match should fail closed');
  }
  assert(count === 0, 'unrelated match was ended');
});

Deno.test('no stray match succeeds; failed server end must not be reported as success', async () => {
  let calls = 0;
  const end = async (_id: string) => { calls++; return false; };
  assert(await finishCanceledRandomMatch(null, end), 'no stray match should be okay');
  assert(calls === 0, 'end called without match');
  assert(!(await finishCanceledRandomMatch({ id:'r', kind:'random', status:'active' }, end)),
    'failed end result must propagate');
  assert(calls === 1, 'expected one attempted server end');
});


Deno.test('unmount waits for a pending start RPC before removing the queue', async () => {
  let resolveStart!: (value: string) => void;
  const pendingStart = new Promise<string>(resolve => { resolveStart = resolve; });
  const order: string[] = [];
  const cancelTask = cancelRandomSearchAfterPending(
    pendingStart,
    async () => { order.push('cancel_waiting'); },
    async () => { order.push('lookup'); return null; },
    async () => { order.push('end'); return true; },
  );

  await Promise.resolve();
  assert(order.length === 0, 'queue cancellation raced ahead of still-pending matching RPC');

  resolveStart('waiting');
  assert(await cancelTask, 'unmount cleanup should succeed');
  assert(order.join(',') === 'cancel_waiting,lookup',
    'queue must be canceled after the start settles and before any stray match lookup');
});

Deno.test('late matched start is reconciled only if its match is an active random match', async () => {
  const order: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const task = cancelRandomSearchAfterPending(
    pending,
    async () => { order.push('cancel_waiting'); },
    async () => {
      order.push('lookup');
      return { id: 'random-late', kind: 'random', status: 'active' };
    },
    async (id) => { order.push('ended:' + id); return true; },
  );
  release();
  assert(await task, 'late match must be ended');
  assert(order.join(',') === 'cancel_waiting,lookup,ended:random-late',
    'late random match must be ended only after removing queue entry');

  let ended = false;
  assert(!(await cancelRandomSearchAfterPending(
    null, async () => {}, async () => ({ id: 'direct-call', kind: 'direct', status: 'active' }),
    async () => { ended = true; return true; },
  )), 'unexpected direct call should fail closed');
  assert(!ended, 'random cleanup must never terminate direct calls');
});

Deno.test('rejected pending start still attempts cleanup; failed cancel cannot claim success', async () => {
  let canceled = 0;
  assert(await cancelRandomSearchAfterPending(
    Promise.reject(new Error('timeout')),
    async () => { canceled++; },
    async () => null,
    async () => true,
  ), 'a rejected start should still allow queue cleanup');
  assert(canceled === 1, 'cancel_waiting was not attempted after failed start');

  let lookedUp = false;
  let rejected = false;
  try {
    await cancelRandomSearchAfterPending(
      null,
      async () => { throw new Error('cancel_waiting denied'); },
      async () => { lookedUp = true; return null; },
      async () => true,
    );
  } catch {
    rejected = true;
  }
  assert(rejected, 'RPC cancellation failure must not be swallowed');
  assert(!lookedUp, 'failed cancel must stop the success path');
});

Deno.test('failed late-match termination is not reported as success', async () => {
  const result = await cancelRandomSearchAfterPending(
    Promise.resolve('matched'),
    async () => {},
    async () => ({ id: 'late-random', kind: 'random', status: 'active' }),
    async () => false,
  );
  assert(!result, 'failed endMatchOnServer must fail closed');
});
