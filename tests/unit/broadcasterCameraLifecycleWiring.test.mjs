import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Browser/React wiring checks; the asynchronous track ownership rules
// are covered by tests/unit/cancelableMediaCapture.test.ts (Deno).
const source = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
const cameraStart = source.indexOf('  // ── الكاميرا ──');
const cameraEnd = source.indexOf('  // ── Wake Lock ──', cameraStart);
const camera = source.slice(cameraStart, cameraEnd);

test('fallback capture releases late getUserMedia grants when broadcaster exits', () => {
  assert.ok(cameraStart !== -1 && cameraEnd > cameraStart, 'camera lifecycle effect is missing');
  assert.match(source, /import \{ createCancelableMediaCapture \} from '\.\.\/utils\/cancelableMediaCapture'/);
  assert.match(camera, /const capture = createCancelableMediaCapture\(/);
  assert.match(camera, /\(\) => navigator\.mediaDevices\.getUserMedia\(/);
  assert.match(camera, /void capture\.start\(\)/);
  assert.match(camera, /capture\.dispose\(\)/);
  assert.match(camera, /streamRef\.current = null/);
  assert.match(camera, /\[initialStream, cameraAttempt\]/);
});

test('successful camera permission marks it ready; denied capture presents an error', () => {
  assert.match(camera, /stream => \{\s*streamRef\.current = stream/);
  assert.match(camera, /setCameraReady\(true\)/);
  assert.match(camera, /error => \{[\s\S]*setCameraReady\(false\)/);
  assert.match(camera, /setCaptureError\('تعذر تشغيل الكاميرا أو الميكروفون/);
  assert.doesNotMatch(camera.slice(camera.indexOf('error => {')), /setCameraReady\(true\)/,
    'failed camera capture must not be marked ready');
});

test('device error can retry getUserMedia, not only fetch a new LiveKit token', () => {
  assert.match(source, /const \[captureError, setCaptureError\]\s*=\s*useState<string \| null>\(null\)/);
  assert.match(source, /const \[cameraAttempt, setCameraAttempt\]\s*=\s*useState\(0\)/);
  assert.match(source, /if \(!initialStream && !cameraReady\) setCameraAttempt\(attempt => attempt \+ 1\)/);
  assert.match(source, /const broadcastProblem = captureError \|\| liveKitError/);
  assert.match(source, /role=\{broadcastProblem \? 'alert' : 'status'\}/);
  assert.match(source, /\{broadcastProblem && <p/);
  assert.match(source, /\{broadcastProblem && <button type="button" onClick=\{retryMediaConnection\}/);
  assert.match(source, /if \(liveKitToken && !broadcastProblem\)/,
    'a missing camera should not start a misleading active LiveKit room');
});

test('studio-owned media is still stopped when broadcaster unmounts', () => {
  assert.match(camera, /if \(initialStream\) \{/);
  assert.match(camera, /initialStream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(camera, /if \(streamRef\.current === initialStream\) streamRef\.current = null/);
});
