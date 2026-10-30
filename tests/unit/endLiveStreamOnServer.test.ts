/// <reference lib="deno.ns" />
import { confirmLiveStreamEnded } from '../../src/utils/endLiveStreamOnServer.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('successful owner update confirms the broadcast has ended', async () => {
  let reads = 0;
  const ended = await confirmLiveStreamEnded(
    async () => ({ data: { id: 'own-stream' }, error: null }),
    async () => { reads++; return { data: { is_live: true }, error: null }; },
  );
  assert(ended, 'successful UPDATE was not acknowledged');
  assert(reads === 0, 'unnecessary status read after confirmed update');
});

Deno.test('concurrent ending is accepted only after server verifies inactive status', async () => {
  const ended = await confirmLiveStreamEnded(
    async () => ({ data: null, error: null }),
    async () => ({ data: { is_live: false }, error: null }),
  );
  assert(ended, 'already-ended broadcast should be a successful idempotent end');
});

Deno.test('zero rows, missing stream, active stream, and RLS-denied status fail closed', async () => {
  for (const status of [
    { data: { is_live: true }, error: null },
    { data: null, error: null },
    { data: { is_live: false }, error: { message: 'RLS denied' } },
  ]) {
    const ended = await confirmLiveStreamEnded(
      async () => ({ data: null, error: null }),
      async () => status,
    );
    assert(!ended, 'stream end falsely reported successful');
  }
});

Deno.test('update errors, thrown network failures and missing confirmation fail closed', async () => {
  let reads = 0;
  assert(!(await confirmLiveStreamEnded(
    async () => ({ data: null, error: { message: 'offline' } }),
    async () => { reads++; return { data: { is_live: false }, error: null }; },
  )), 'database error incorrectly reported success');
  assert(reads === 0, 'must not treat failed update as an already-ended stream');

  assert(!(await confirmLiveStreamEnded(
    async () => { throw new Error('network offline'); },
    async () => ({ data: { is_live: false }, error: null }),
  )), 'network error incorrectly reported success');

  assert(!(await confirmLiveStreamEnded(
    async () => ({ data: null, error: null }),
    async () => { throw new Error('connection reset'); },
  )), 'failed status verification incorrectly reported success');
});
