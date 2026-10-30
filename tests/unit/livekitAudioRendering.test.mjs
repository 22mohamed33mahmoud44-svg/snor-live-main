import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A code-wiring regression guard, not a substitute for a two-browser
// end-to-end audio test against an isolated LiveKit staging room.
const source = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const roomStart = source.indexOf('<LiveKitRoom');
const roomEnd = source.indexOf('</LiveKitRoom>', roomStart);
const roomMarkup = source.slice(roomStart, roomEnd);

test('both audio and video calls render subscribed remote audio tracks', () => {
  assert.ok(roomStart !== -1 && roomEnd > roomStart, 'LiveKit room not found');
  assert.match(source, /import\s*\{[^}]*\bRoomAudioRenderer\b[^}]*\}\s*from\s*['"]@livekit\/components-react['"]/);
  assert.equal((roomMarkup.match(/<RoomAudioRenderer\s*\/>/g) || []).length, 1,
    'one remote audio renderer must be mounted under LiveKitRoom');
  assert.doesNotMatch(roomMarkup, /<RoomAudioRenderer\s+[^>]*muted=/,
    'muting the local microphone must not silence remote speakers');
  assert.match(roomMarkup, /<CallUI\b[\s\S]*callType=\{callType\}/,
    'both call modes must use the same room with the audio renderer');
});

test('audio autoplay recovery control is reachable within the call room', () => {
  assert.match(source, /import\s*\{[^}]*\bStartAudio\b[^}]*\}\s*from\s*['"]@livekit\/components-react['"]/);
  assert.equal((roomMarkup.match(/<StartAudio\b/g) || []).length, 1,
    'exactly one LiveKit autoplay recovery control is expected');
  assert.match(roomMarkup, /label="اضغط لتشغيل صوت المكالمة"/);
  assert.match(roomMarkup, /zIndex:\s*1002/,
    'autoplay control must remain reachable over the fixed call overlay');
});
