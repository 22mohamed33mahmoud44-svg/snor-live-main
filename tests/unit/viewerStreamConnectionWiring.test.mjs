import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Wiring checks. A two-device staging test is still required for actual
// WebRTC connection, dropped internet, token errors and mobile autoplay.
const source = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');

test('token fetch has a bounded wait and ignores old attempts on retry', () => {
  assert.match(source, /const VIEWER_TOKEN_TIMEOUT_MS = 20_000/);
  assert.match(source, /const tokenTimeout = window\.setTimeout\(\(\) => \{/);
  assert.match(source, /setConnectionError\('انتهت مهلة تجهيز البث/);
  assert.match(source, /if \(isCancelled\) return;/);
  assert.match(source, /window\.clearTimeout\(tokenTimeout\)/);
  assert.match(source, /\[streamId, myUsername, connectionAttempt\]/);
  assert.match(source, /if \(funcError \|\| !data\?\.token\)/);
});

test('room errors, disconnects, and connection stalls show a recovery state', () => {
  assert.match(source, /const VIEWER_MEDIA_TIMEOUT_MS = 30_000/);
  assert.match(source, /onConnected=\{\(\) => handleMediaConnected\(roomAttemptId\)\}/);
  assert.match(source, /onDisconnected=\{\(\) => handleMediaDisconnected\(roomAttemptId\)\}/);
  assert.match(source, /onError=\{\(error\) => handleMediaError\(roomAttemptId, error\)\}/);
  assert.match(source, /if \(!liveKitToken \|\| mediaConnected \|\| connectionError\) return/);
  assert.match(source, /\[liveKitToken, mediaConnected, connectionError\]/);
  assert.match(source, /setConnectionError\('تأخر الاتصال بالبث/);
  assert.match(source, /key=\{roomAttemptId\}/);
});

test('viewer sees actionable error with reconnect and back controls instead of endless spinner', () => {
  assert.match(source, /\{connectionError \? \(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /\{connectionError\}/);
  assert.match(source, /onClick=\{retryConnection\}/);
  assert.match(source, /onClick=\{onExit\}/);
  assert.match(source, /setConnectionAttempt\(attempt => attempt \+ 1\)/);
  assert.match(source, /setLiveKitToken\(null\)/);
});

test('reconnect never asks to publish viewer camera or microphone', () => {
  assert.match(source, /video=\{false\}/);
  assert.match(source, /audio=\{false\}/);
  assert.match(source, /<RoomAudioRenderer\s*\/>/);
  assert.match(source, /<StartAudio\b/);
});
