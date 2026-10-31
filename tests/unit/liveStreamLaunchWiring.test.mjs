import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source wiring regression guard: database concurrency across multiple devices
// needs a separate server-side constraint, validated only in isolated staging.
const studio = readFileSync(new URL('../../src/components/LiveStreamStudio.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../src/Dashboard.tsx', import.meta.url), 'utf8');

test('studio has a single in-flight launch and waits for server acknowledgement', () => {
  assert.match(studio, /onStart: \(title: string, filterId: string, intensity: number, stream: MediaStream \| null\) => Promise<boolean>/);
  assert.match(studio, /createStreamLaunchGate\(/);
  assert.match(studio, /if \(launchingRef\.current \|\| cameraStatus !== 'ready'\) return/);
  assert.match(studio, /const result = await launchGateRef\.current\.start\(/);
  assert.match(studio, /if \(result !== 'started'\)/);
  assert.match(studio, /handedOffRef\.current = false/);
  assert.match(studio, /setLaunchError\('تعذر بدء البث/);
  assert.equal((studio.match(/disabled=\{cameraStatus !== 'ready' \|\| launching\}/g) || []).length, 2,
    'start controls must be disabled on mobile and desktop');
  assert.equal((studio.match(/\{\(launchFailure \|\| launchError\) && <p role="alert"/g) || []).length, 2,
    'failed startup must show retryable errors on mobile and desktop');
});

test('camera tracks are released for cancelled or stale getUserMedia attempts', () => {
  assert.match(studio, /const captureRequestRef = useRef\(0\)/);
  assert.match(studio, /requestId !== captureRequestRef\.current/);
  assert.match(studio, /stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(studio, /unmountedRef\.current = true/);
  assert.match(studio, /captureRequestRef\.current\+\+/);
  assert.match(studio, /if \(!handedOffRef\.current && streamRef\.current\)/);
  assert.match(studio, /if \(launchingRef\.current\) return;\s*handedOffRef\.current = false/);
});

test('dashboard does not report startup success until it has an inserted stream ID', () => {
  const start = dashboard.indexOf('const handleLaunchLiveStream = async (');
  const end = dashboard.indexOf('  useEffect(() => {', start);
  assert.ok(start >= 0 && end > start, 'dashboard launch function missing');
  const handler = dashboard.slice(start, end);
  assert.match(handler, /Promise<boolean>/);
  assert.match(handler, /if \(liveLaunchPendingRef\.current \|\| activeLiveStream \|\| !stream/);
  assert.match(handler, /liveLaunchPendingRef\.current = true/);
  assert.match(handler, /\.select\('id'\)\s*\.single\(\)/);
  assert.match(handler, /if \(error \|\| !data\?\.id\)/);
  assert.match(handler, /setActiveLiveStream\(\{ id: data\.id/);
  assert.match(handler, /setShowLiveStudio\(false\)/);
  assert.match(handler, /return true/);
  assert.match(handler, /finally \{\s*liveLaunchPendingRef\.current = false/);
  assert.doesNotMatch(handler, /alert\(/, 'studio owns visible startup error state');
});

test('cross-device duplicate active stream is clearly explained in studio', () => {
  assert.match(dashboard, /streamLaunchErrorMessage\(error\)/);
  assert.match(dashboard, /launchFailure=\{liveLaunchFailure\}/);
  assert.equal((studio.match(/\{launchFailure \|\| launchError\}<\/p>/g) || []).length, 2,
    'server conflict reason must be shown on both mobile and desktop');
});
