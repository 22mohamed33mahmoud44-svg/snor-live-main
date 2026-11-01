import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachLocalPreview } from '../../src/utils/attachLocalPreview.mjs';

const makeVideo = () => ({
  srcObject: null,
  plays: 0,
  play() { this.plays += 1; return Promise.resolve(); },
});

test('remounting LiveKit wrapper reattaches existing camera stream to new video element', () => {
  const stream = { id: 'camera-active' };
  const first = makeVideo();
  attachLocalPreview(first, stream);
  assert.equal(first.srcObject, stream);
  const second = makeVideo();
  attachLocalPreview(second, stream);
  assert.equal(second.srcObject, stream, 'new DOM video must not remain black');
  assert.equal(second.plays, 1);
});

test('late camera capture and stream cleanup attach and detach safely', () => {
  const video = makeVideo();
  const stream = { id: 'late-capture' };
  attachLocalPreview(video, null);
  assert.equal(video.plays, 0);
  attachLocalPreview(video, stream);
  assert.equal(video.srcObject, stream);
  attachLocalPreview(video, null);
  assert.equal(video.srcObject, null);
  attachLocalPreview(null, stream);
});

test('autoplay rejection does not interrupt broadcaster media publication', async () => {
  const video = { srcObject: null, play: () => Promise.reject(new Error('autoplay blocked')) };
  attachLocalPreview(video, { id: 'stream' });
  await Promise.resolve();
  assert.notEqual(video.srcObject, null);
});

test('broadcaster uses callback ref so video is rebound after LiveKitRoom remount', () => {
  const source = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
  assert.match(source, /const attachPreviewVideo = useCallback\(\(video: HTMLVideoElement \| null\) => \{/);
  assert.match(source, /attachLocalPreview\(video, streamRef\.current\)/);
  assert.match(source, /ref=\{attachPreviewVideo\}/);
  assert.doesNotMatch(source, /ref=\{videoRef\}/);
  assert.match(source, /attachLocalPreview\(videoRef\.current, initialStream\)/);
  assert.match(source, /attachLocalPreview\(videoRef\.current, stream\)/);
});
