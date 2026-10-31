import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const room = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');

// These check source wiring; a real two-device staging test remains necessary
// for LiveKit media transport, browser permissions, and reconnection.
test('broadcaster never claims LIVE before its camera/mic publish completes', () => {
  assert.match(room, /const \[mediaPublished, setMediaPublished\] = useState\(false\)/);
  assert.match(room, /onPublished: \(\) => void/);
  assert.match(room, /if \(!disposed\) onPublished\(\)/);
  assert.match(room, /if \(!disposed\) \{[\s\S]*onPublishError\(error instanceof Error/);
  assert.match(room, /mediaPublished \? `LIVE \$\{formatTime\(uptime\)\}` : 'جاري تجهيز البث'/);
});

test('broadcaster has token timeout and no silent failed token requests', () => {
  assert.match(room, /const tokenTimeout = window\.setTimeout\(\(\) => \{/);
  assert.match(room, /\}, 20_000\)/);
  assert.match(room, /if \(error \|\| !data\?\.token\)/);
  assert.match(room, /if \(cancelled\) return/);
  assert.match(room, /window\.clearTimeout\(tokenTimeout\)/);
  assert.match(room, /\[streamId, myUsername, connectionAttempt\]/);
});

test('reconnection and publish failure are actionable, without stale room reuse', () => {
  assert.match(room, /const retryMediaConnection = useCallback\(\(\) => \{/);
  assert.match(room, /setLiveKitToken\(null\)/);
  assert.match(room, /setConnectionAttempt\(attempt => attempt \+ 1\)/);
  assert.match(room, /onError=\{\(error\) => handleMediaFailure\(roomAttemptId, error\)\}/);
  assert.match(room, /onDisconnected=\{\(\) => \{/);
  assert.match(room, /onPublishError=\{onPublishErrorForAttempt\}/);
  assert.match(room, /\}, 35_000\)/);
  assert.match(room, /key=\{roomAttemptId\}/);
});

test('broadcaster can end a stream safely when media never becomes available', () => {
  assert.match(room, /\{!mediaPublished && \(/);
  assert.match(room, /role=\{broadcastProblem \? 'alert' : 'status'\}/);
  assert.match(room, /onClick=\{retryMediaConnection\}/);
  assert.match(room, /onClick=\{\(\) => setShowEndModal\(true\)\}/);
  assert.match(room, /if \(liveKitToken && !broadcastProblem\)/);
  assert.match(room, /<LiveKitRoom[\s\S]*video=\{false\}[\s\S]*audio=\{false\}/);
  assert.match(room, /<StreamPublisher[\s\S]*onPublished=\{onPublishedForAttempt\}/);
});
