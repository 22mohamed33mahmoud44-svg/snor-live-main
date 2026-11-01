import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');

test('broadcaster desktop layout uses a portrait mobile-size frame rather than a fullscreen wide image', () => {
  assert.match(broadcaster, /className="snor-broadcaster-phone-frame"/);
  assert.match(broadcaster, /style=\{styles\.phoneFrame\}/);
  assert.match(broadcaster, /\.snor-broadcaster-phone-frame\s*\{\s*width:\s*100%;\s*height:\s*100%;/);
  assert.match(broadcaster, /@media \(min-width: 768px\)[\s\S]*?\.snor-broadcaster-phone-frame\s*\{[\s\S]*?width: min\(420px, 50\.625dvh, calc\(100vw - 24px\)\);[\s\S]*?aspect-ratio: 9 \/ 16;/);
  assert.match(broadcaster, /\.snor-broadcaster-video \{ object-fit: contain; \}/);
  assert.match(broadcaster, /className="snor-broadcaster-video"/);
  assert.doesNotMatch(broadcaster, /objectFit: 'cover' as const/);
});

test('viewer matches portrait frame and keeps landscape camera from zooming on desktop', () => {
  assert.match(viewer, /className="snor-viewer-phone-frame"/);
  assert.match(viewer, /\.snor-viewer-phone-frame \{ width: 100%; height: 100%; \}/);
  assert.match(viewer, /@media \(min-width: 768px\)[\s\S]*?\.snor-viewer-phone-frame\s*\{[\s\S]*?width: min\(420px, 50\.625dvh, calc\(100vw - 24px\)\);[\s\S]*?aspect-ratio: 9 \/ 16;/);
  assert.match(viewer, /\.snor-viewer-video \{ object-fit: contain; \}/);
  assert.match(viewer, /<VideoTrack className="snor-viewer-video"/);
  assert.doesNotMatch(viewer, /<VideoTrack[^>]+objectFit: 'cover'/);
});

test('mobile retains full-screen framing for broadcaster and viewer', () => {
  assert.match(broadcaster, /width: '100vw', height: '100dvh'/);
  assert.match(viewer, /width: '100vw', height: '100dvh'/);
  assert.match(broadcaster, /\.snor-broadcaster-video \{ object-fit: cover; \}/);
  assert.match(viewer, /\.snor-viewer-video \{ object-fit: cover; \}/);
});
