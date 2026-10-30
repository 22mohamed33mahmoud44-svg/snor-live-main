/// <reference lib="deno.ns" />
import { createCancelableMediaCapture } from '../../src/utils/cancelableMediaCapture.ts';

function assert(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
}
const makeStream = () => {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } },
    { stopped: false, stop() { this.stopped = true; } }];
  return { tracks, getTracks: () => tracks };
};

Deno.test('permission granted after leaving stops every camera/mic track', async () => {
  let release!: (stream: ReturnType<typeof makeStream>) => void;
  const pending = new Promise<ReturnType<typeof makeStream>>(resolve => { release = resolve; });
  let readyCalls = 0;
  let errorCalls = 0;
  const capture = createCancelableMediaCapture(() => pending,
    () => { readyCalls++; }, () => { errorCalls++; });
  const start = capture.start();
  capture.dispose();
  const late = makeStream();
  release(late);
  await start;
  assert(late.tracks.every(track => track.stopped), 'late permissions left device tracks running');
  assert(readyCalls === 0, 'media from an unmounted component reached UI');
  assert(errorCalls === 0, 'unexpected capture error');
});

Deno.test('live capture is released when broadcaster leaves', async () => {
  const stream = makeStream();
  let accepted = 0;
  const capture = createCancelableMediaCapture(async () => stream,
    () => { accepted++; }, () => { throw new Error('unexpected'); });
  await capture.start();
  assert(accepted === 1, 'successful capture was not accepted');
  assert(stream.tracks.every(track => !track.stopped), 'track was stopped before leaving');
  capture.dispose();
  assert(stream.tracks.every(track => track.stopped), 'active tracks leaked on unmount');
  capture.dispose(); // idempotent
});

Deno.test('camera permission failure reports error without saying capture is ready', async () => {
  let errorCalls = 0;
  let readyCalls = 0;
  const capture = createCancelableMediaCapture(
    async () => { throw new Error('permission denied'); },
    () => { readyCalls++; },
    () => { errorCalls++; },
  );
  await capture.start();
  assert(errorCalls === 1 && readyCalls === 0, 'capture error was reported as a ready camera');
});

Deno.test('stale rejected permission request cannot update an exited broadcaster', async () => {
  let rejectRequest!: (error: Error) => void;
  const pending = new Promise<ReturnType<typeof makeStream>>((_resolve, reject) => {
    rejectRequest = reject;
  });
  let called = false;
  const capture = createCancelableMediaCapture(() => pending,
    () => { called = true; }, () => { called = true; });
  const start = capture.start();
  capture.dispose();
  rejectRequest(new Error('permission rejected after exit'));
  await start;
  assert(!called, 'stale rejection updated an unmounted broadcaster');
});
