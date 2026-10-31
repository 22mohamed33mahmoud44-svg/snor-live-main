/// <reference lib="deno.ns" />
import { createMatchEndStatusPoller, MATCH_END_STATUS_TIMEOUT_MS } from '../../src/utils/matchEndStatusPoller.ts';

function assert(ok: unknown, description: string) {
  if (!ok) throw new Error(description);
}

Deno.test('slow status requests stay single-flight across overlapping timer ticks', async () => {
  let release!: (value: { data: { status: string }; error: null }) => void;
  const waiting = new Promise<{ data: { status: string }; error: null }>(resolve => {
    release = resolve;
  });
  let calls = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(
    async () => { calls++; return waiting; },
    () => { ended++; },
  );
  const first = watcher.check();
  const second = watcher.check();
  const third = watcher.check();
  assert(first === second && second === third, 'poll ticks spawned separate requests');
  await Promise.resolve();
  assert(calls === 1, 'slow query was duplicated');
  release({ data: { status: 'active' }, error: null });
  await Promise.all([first, second, third]);
  assert(ended === 0, 'active match incorrectly reported ended');
  await watcher.check();
  assert(calls === 2, 'polling did not resume after the request settled');
  watcher.dispose();
});

Deno.test('a successful ended status invokes exit once, even with multiple checks', async () => {
  let calls = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(
    async () => { calls++; return { data: { status: 'ended' }, error: null }; },
    () => { ended++; },
  );
  await watcher.check();
  await watcher.check();
  assert(calls === 1 && ended === 1, 'ended status navigated multiple times');
  watcher.dispose();
});

Deno.test('offline and RLS failures never falsely end a call and later polls can retry', async () => {
  let calls = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    if (calls === 2) return { data: null, error: { code: '42501' } };
    return { data: { status: 'ended' }, error: null };
  }, () => { ended++; });

  await watcher.check();
  await watcher.check();
  assert(ended === 0, 'failed/denied status query reported call ended');
  await watcher.check();
  assert(calls === 3 && ended === 1, 'poller failed to recover after network/RLS error');
  watcher.dispose();
});

Deno.test('leaving the call ignores an old ended response that arrives after cleanup', async () => {
  let complete!: (data: { data: { status: string }; error: null }) => void;
  const pending = new Promise<{ data: { status: string }; error: null }>(resolve => {
    complete = resolve;
  });
  let navigated = 0;
  const watcher = createMatchEndStatusPoller(() => pending, () => { navigated++; });
  const request = watcher.check();
  await Promise.resolve();
  watcher.dispose();
  complete({ data: { status: 'ended' }, error: null });
  await request;
  await watcher.check();
  assert(navigated === 0, 'a late response navigated away from a new call screen');
});

Deno.test('old and new match status watchers cannot interfere with each other', async () => {
  let finishOld!: (data: { data: { status: string }; error: null }) => void;
  const oldNetwork = new Promise<{ data: { status: string }; error: null }>(resolve => {
    finishOld = resolve;
  });
  let exitedOld = 0;
  let exitedNew = 0;
  const old = createMatchEndStatusPoller(() => oldNetwork, () => { exitedOld++; });
  const oldPending = old.check();
  await Promise.resolve();
  old.dispose();
  const fresh = createMatchEndStatusPoller(
    async () => ({ data: { status: 'active' }, error: null }),
    () => { exitedNew++; },
  );
  await fresh.check();
  finishOld({ data: { status: 'ended' }, error: null });
  await oldPending;
  assert(exitedOld === 0 && exitedNew === 0, 'old match end affected the new match');
  fresh.dispose();
});


Deno.test('a hanging status fetch times out and the next poll can confirm a real end', async () => {
  let deliverLate!: (value: { data: { status: string }; error: null }) => void;
  const hung = new Promise<{ data: { status: string }; error: null }>(resolve => {
    deliverLate = resolve;
  });
  let reads = 0;
  let aborted = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(
    async signal => {
      reads++;
      if (reads === 1) {
        signal.addEventListener('abort', () => { aborted++; }, { once: true });
        return hung;
      }
      return { data: { status: 'ended' }, error: null };
    },
    () => { ended++; },
    15,
  );
  await watcher.check();
  assert(reads === 1 && aborted === 1 && ended === 0,
    'timed-out fetch was not aborted or falsely reported ended');
  await watcher.check();
  assert(reads === 2 && ended === 1,
    'hung first request kept the single-flight lock forever');
  deliverLate({ data: { status: 'ended' }, error: null });
  await Promise.resolve();
  assert(ended === 1, 'old response caused a second call end');
  watcher.dispose();
});

Deno.test('an old timed-out ended response cannot override a newer active-status read', async () => {
  let completeOld!: (value: { data: { status: string }; error: null }) => void;
  const pending = new Promise<{ data: { status: string }; error: null }>(resolve => {
    completeOld = resolve;
  });
  let calls = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(
    () => ++calls === 1
      ? pending
      : Promise.resolve({ data: { status: 'active' }, error: null }),
    () => { ended++; },
    12,
  );
  await watcher.check();
  await watcher.check();
  completeOld({ data: { status: 'ended' }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert(calls === 2 && ended === 0,
    'expired request overwrote a fresh active call state');
  watcher.dispose();
});

Deno.test('disposing an unresponsive fetch aborts it and resolves the in-flight poll', async () => {
  let controllerSignal: AbortSignal | null = null;
  let callCount = 0;
  let ended = 0;
  const watcher = createMatchEndStatusPoller(
    signal => {
      controllerSignal = signal;
      callCount++;
      return new Promise(() => {}); // an uncooperative network stack
    },
    () => { ended++; },
    60_000,
  );
  const poll = watcher.check();
  await Promise.resolve();
  watcher.dispose();
  await poll; // must resolve on abort, not after the 60-second timeout
  assert(controllerSignal?.aborted === true && ended === 0 && callCount === 1,
    'dispose did not immediately release a hung call status fetch');
  await watcher.check();
  assert(callCount === 1, 'disposed watcher sent another request');
});

Deno.test('a quickly completed status check cancels its deadline timer', async () => {
  assert(MATCH_END_STATUS_TIMEOUT_MS === 12_000, 'unexpected default status deadline');
  let aborts = 0;
  const watcher = createMatchEndStatusPoller(
    async signal => {
      signal.addEventListener('abort', () => { aborts++; }, { once: true });
      return { data: { status: 'active' }, error: null };
    },
    () => { throw Error('active match must not end'); },
    12,
  );
  await watcher.check();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(aborts === 0, 'completed status check kept its timeout active');
  watcher.dispose();
});
