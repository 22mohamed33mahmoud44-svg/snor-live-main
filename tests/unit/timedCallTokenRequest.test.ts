/// <reference lib="deno.ns" />
import { beginTimedCallTokenRequest, type CallTokenResult } from '../../src/utils/timedCallTokenRequest.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

Deno.test('successful token request reports ready exactly once', async () => {
  const results: CallTokenResult[] = [];
  const cancel = beginTimedCallTokenRequest(
    async () => ({ data: { token: 'safe-room-token' }, error: null }),
    100,
    result => results.push(result),
  );
  await tick();
  assert(results.length === 1 && results[0].status === 'ready' &&
    results[0].token === 'safe-room-token', 'successful request did not return token');
  cancel();
});

Deno.test('hung request reports a timeout and rejects a late successful token', async () => {
  let finish!: (value: { data: { token: string } }) => void;
  const hanging = new Promise<{ data: { token: string } }>(resolve => { finish = resolve; });
  const results: CallTokenResult[] = [];
  const cancel = beginTimedCallTokenRequest(() => hanging, 5, value => results.push(value));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(results.length === 1 && results[0].status === 'timeout',
    'request spinner did not time out');
  finish({ data: { token: 'too-late-token' } });
  await tick();
  assert(results.length === 1, 'late stale request overwrote timeout state');
  cancel();
});

Deno.test('retry cleanup ignores old tokens and errors without timers', async () => {
  let completeOld!: (value: { data: { token: string } }) => void;
  const pending = new Promise<{ data: { token: string } }>(resolve => { completeOld = resolve; });
  const results: CallTokenResult[] = [];
  const cleanup = beginTimedCallTokenRequest(() => pending, 5, result => results.push(result));
  await tick();
  cleanup();
  completeOld({ data: { token: 'old-call' } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(results.length === 0, 'old request invoked callback after retry/unmount');
});

Deno.test('missing token, Supabase errors and rejected network requests fail safely', async () => {
  const requests = [
    async () => ({ data: null, error: null }),
    async () => ({ data: { token: '' }, error: null }),
    async () => ({ data: { token: 'unsafe' }, error: { message: 'unauthorized' } }),
    async () => { throw new Error('network down'); },
  ];
  for (const request of requests) {
    const results: CallTokenResult[] = [];
    const cleanup = beginTimedCallTokenRequest(request, 100, result => results.push(result));
    await tick();
    assert(results.length === 1 && results[0].status === 'failed',
      'missing, denied or rejected token request must be retryable error');
    cleanup();
  }
});
