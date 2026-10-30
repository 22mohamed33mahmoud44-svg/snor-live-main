import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-wiring regression tests; real device permissions, streaming and
// audio transport still need two-browser staging tests.
const source = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const callUi = source.slice(source.indexOf('function CallUI('));

test('mic and camera controls toggle published LiveKit tracks', () => {
  assert.match(source, /\bTrackToggle\b/);
  assert.match(callUi, /<TrackToggle source=\{Track\.Source\.Microphone\}/);
  assert.match(callUi, /<TrackToggle source=\{Track\.Source\.Camera\}/);
  assert.match(callUi, /useLocalParticipant\(\)/);
  assert.match(callUi, /isMicrophoneEnabled\s*\?/);
  assert.match(callUi, /isCameraEnabled/);
  assert.doesNotMatch(callUi, /setMuted\(|setCamOff\(/,
    'React state alone cannot change a published microphone or camera');
});

test('camera controls are unavailable in audio-only calls', () => {
  assert.match(callUi, /\{callType !== 'audio' && <TrackToggle source=\{Track\.Source\.Camera\}/);
  assert.match(source, /video=\{callType === 'video'\}/);
  assert.match(source, /audio=\{true\}/);
  assert.doesNotMatch(source, /audio=\{!muted\}|video=\{callType === 'video' && !camOff\}/,
    'room startup props must not be treated as live device toggles');
});

test('errors are visible and camera/microphone toggles are disabled while disconnected', () => {
  assert.equal((callUi.match(/disabled=\{!isConnected\}/g) || []).length, 2);
  assert.equal((callUi.match(/onDeviceError=/g) || []).length, 2);
  assert.match(callUi, /role="alert">\{mediaError\}/);
  assert.match(source, /<RoomAudioRenderer\s*\/>/,
    'local microphone muting must not remove remote speaker audio');
});
