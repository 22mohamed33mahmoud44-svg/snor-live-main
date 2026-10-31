/// <reference lib="deno.ns" />
import { createStreamLaunchGate } from '../../src/utils/streamLaunchGate.ts';

function assert(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
}

Deno.test('a duplicate launch while the server insert is pending never runs', async () => {
  let release: ((ok: boolean) => void) | undefined;
  const gatePromise = new Promise<boolean>(resolve => { release = resolve; });
  let insertCount = 0;
  const gate = createStreamLaunchGate(async () => {
    insertCount += 1;
    return await gatePromise;
  });

  const first = gate.start();
  assert(gate.isPending(), 'launch lock should be immediate');
  assert((await gate.start()) === 'busy', 'second click should be ignored');
  assert(insertCount === 1, 'duplicate database inserts were attempted');
  if (!release) throw new Error('test promise not initialized');
  release(true);
  assert((await first) === 'started', 'first successful insert must launch');
  assert(!gate.isPending(), 'launch lock must clear');
  assert((await gate.start()) === 'busy', 'accepted session must not create another stream');
  assert(insertCount === 1, 'post-acceptance repeat created another stream');
});

Deno.test('failed database inserts allow a single subsequent retry', async () => {
  let writes = 0;
  const gate = createStreamLaunchGate(async () => (++writes) > 1);
  assert((await gate.start()) === 'failed', 'failed insert must not be marked started');
  assert(!gate.hasStarted(), 'failed session was accepted');
  assert((await gate.start()) === 'started', 'failed insert must allow retry');
  assert(writes === 2 && gate.hasStarted(), 'unexpected retry behavior');
});

Deno.test('network exceptions unlock the gate without a phantom start', async () => {
  let writes = 0;
  const gate = createStreamLaunchGate(async (_name: string) => {
    writes++;
    if (writes === 1) throw new Error('network offline');
    return true;
  });
  assert((await gate.start('first')) === 'failed', 'network error should be recoverable');
  assert(!gate.isPending() && !gate.hasStarted(), 'network error must unlock');
  assert((await gate.start('second')) === 'started', 'second attempt must work');
  assert(writes === 2, 'unexpected number of writes');
});
