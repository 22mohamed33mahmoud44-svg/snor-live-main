/// <reference lib="deno.ns" />
import { finishCanceledRandomMatch } from '../../src/utils/cancelRandomMatch.ts';

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
