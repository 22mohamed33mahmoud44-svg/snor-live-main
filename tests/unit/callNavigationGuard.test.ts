/// <reference lib="deno.ns" />
import { createCallNavigationGuard } from '../../src/utils/callNavigationGuard.ts';

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test('only one confirmed hangup can navigate from the same call', () => {
  const guard = createCallNavigationGuard();
  assert(guard.isActive(), 'a new call must start active');
  assert(guard.claim(), 'first confirmed hangup must navigate');
  assert(!guard.claim() && !guard.isActive(), 'duplicate Realtime/RPC end navigated again');
  guard.dispose();
  assert(!guard.claim(), 'disposed guard navigated');
});

Deno.test('an old hangup acknowledgement arriving after call switch cannot navigate', async () => {
  let respond!: () => void;
  const outstanding = new Promise<void>(resolve => { respond = resolve; });
  const old = createCallNavigationGuard();
  let oldNavigations = 0;
  const request = (async () => {
    await outstanding;
    if (old.claim()) oldNavigations++;
  })();

  old.dispose(); // a new match replaces the old call UI
  const current = createCallNavigationGuard();
  let newNavigations = 0;
  assert(current.isActive(), 'new room should remain navigable');
  respond();
  await request;
  assert(oldNavigations === 0 && newNavigations === 0,
    'the old hangup removed the newer active call');
  if (current.claim()) newNavigations++;
  assert(newNavigations === 1, 'new call cannot navigate normally after old response');
});

Deno.test('an error from an expired call cannot show its old error banner', async () => {
  const old = createCallNavigationGuard();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let errorBanners = 0;
  const request = (async () => {
    await waiting;
    if (old.isActive()) errorBanners++;
  })();
  old.dispose();
  release();
  await request;
  assert(errorBanners === 0, 'network failure from old call showed an error in newer UI');
});

Deno.test('separate calls have separate navigation guards', () => {
  const prior = createCallNavigationGuard();
  const latest = createCallNavigationGuard();
  prior.dispose();
  assert(!prior.claim() && latest.claim(),
    'disposing the old room broke navigation in the next call');
});
