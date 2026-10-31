import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');
const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
const start = viewer.indexOf('<LiveKitRoom');
const end = viewer.indexOf('</LiveKitRoom>', start);
const viewerRoom = viewer.slice(start, end);

test('viewers only subscribe and never request their own mic/camera when watching live', () => {
  assert.ok(start >= 0 && end > start, 'viewer LiveKitRoom missing');
  assert.match(viewerRoom, /video=\{false\}/);
  assert.match(viewerRoom, /audio=\{false\}/, 'viewer must not publish/request their microphone');
  assert.doesNotMatch(viewerRoom, /audio=\{true\}/, 'viewers must not publish audio');
  assert.match(viewerRoom, /<LiveStreamVideoRenderer\s*\/>/);
  assert.match(viewerRoom, /<RoomAudioRenderer\s*\/>/, 'receive-only viewers still need remote audio');
});

test('viewers can explicitly unblock browser autoplay for remote audio', () => {
  assert.match(viewer, /import\s*\{[^}]*\bStartAudio\b[^}]*\}\s*from\s*['"]@livekit\/components-react['"]/);
  assert.equal((viewerRoom.match(/<StartAudio\b/g) || []).length, 1);
  assert.match(viewerRoom, /label="اضغط لتشغيل صوت البث"/);
  assert.match(viewerRoom, /zIndex:\s*30/);
});

test('broadcaster publishes the studio MediaStream only after LiveKit connects', () => {
  assert.match(broadcaster, /useConnectionState\(\)/);
  assert.match(broadcaster, /connectionState !== ConnectionState\.Connected/);
  assert.match(broadcaster, /track\.readyState !== 'live'/);
  assert.match(broadcaster, /room\.localParticipant\.publishTrack\(track/);
  assert.match(broadcaster, /getTrackPublication\(source\)/);
  assert.match(broadcaster, /room\.localParticipant\.unpublishTrack\(pub\.track, false\)/,
    'temporary reconnect must not stop studio-owned camera and mic tracks');
  assert.match(broadcaster, /if \(disposed\)/, 'pending publish must be checked after unmount');
});
