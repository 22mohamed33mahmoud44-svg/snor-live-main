/// <reference lib="deno.ns" />
import { confirmMatchEnded } from '../../src/utils/confirmMatchEnded.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('successful match update ends call without a second status query', async () => {
  let reads = 0;
  const result = await confirmMatchEnded(
    async () => ({ data: { id: 'matched' }, error: null }),
    async () => { reads++; return { data: { status: 'active' }, error: null }; },
  );
  assert(result && reads === 0, 'successful update must confirm end immediately');
});

Deno.test('concurrent already-ended call succeeds only with verified ended status', async () => {
  assert(await confirmMatchEnded(
    async () => ({ data: null, error: null }),
    async () => ({ data: { status: 'ended' }, error: null }),
  ), 'already-ended call should be safe to leave');

  for (const status of [
    { data: { status: 'active' }, error: null },
    { data: null, error: null },
    { data: { status: 'ended' }, error: { code: '42501' } },
  ]) {
    assert(!(await confirmMatchEnded(
      async () => ({ data: null, error: null }),
      async () => status,
    )), 'unknown/unverified server status cannot confirm a hangup');
  }
});

Deno.test('update errors do not trigger status fallback or report ended', async () => {
  let reads = 0;
  const result = await confirmMatchEnded(
    async () => ({ data: null, error: { code: '42501' } }),
    async () => { reads++; return { data: { status: 'ended' }, error: null }; },
  );
  assert(!result && reads === 0, 'a denied update must not be treated as ended');
});

Deno.test('network exceptions from update or status never escape or falsely report success', async () => {
  assert(!(await confirmMatchEnded(
    async () => { throw new Error('network offline'); },
    async () => ({ data: { status: 'ended' }, error: null }),
  )), 'offline update was treated as ended');
  assert(!(await confirmMatchEnded(
    async () => ({ data: null, error: null }),
    async () => { throw new Error('disconnected during status check'); },
  )), 'unavailable read was treated as ended');
});
