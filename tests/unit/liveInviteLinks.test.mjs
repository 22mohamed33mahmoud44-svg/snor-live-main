import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readLiveInvite, buildLiveInviteUrl, clearLiveInviteUrl,
} from '../../src/utils/liveInvite.mjs';

const streamId = 'fab07896-171f-4e0f-9dce-2178872cbacf';
const userId = '7a1beb8e-17d0-49a4-87f2-ac906b581f1d';

test('share link can be reopened on main site without leaking tokens or keys', () => {
  const url = buildLiveInviteUrl('https://snor-live-main.vercel.app', streamId.toUpperCase());
  assert.equal(url, 'https://snor-live-main.vercel.app/?live=' + streamId);
  assert.equal(readLiveInvite(new URL(url).search), streamId);
  assert.ok(!url.includes(userId));
});

test('invalid UUIDs and insecure share URLs fail closed', () => {
  for (const bad of ['', '123', 'null', '../../admin', 'abc?other=1']) {
    assert.equal(readLiveInvite('?live=' + encodeURIComponent(bad)), null);
    assert.throws(() => buildLiveInviteUrl('https://snorlive.com', bad));
  }
  assert.throws(() => buildLiveInviteUrl('http://insecure.example', streamId));
  assert.equal(readLiveInvite('?unused=1'), null);
});

test('clearing a shared-stream parameter preserves the rest of the URL', () => {
  const url = 'https://snorlive.com/?lang=ar&live=' + streamId + '#hello';
  assert.equal(clearLiveInviteUrl(url), '/?lang=ar#hello');
  assert.equal(clearLiveInviteUrl('https://snorlive.com/?live=' + streamId), '/');
});

test('host and viewer can share while keeping publishing rights server-only', () => {
  const root = new URL('../../', import.meta.url);
  const host = readFileSync(new URL('src/components/ActiveLiveRoom.tsx', root), 'utf8');
  const viewer = readFileSync(new URL('src/components/ViewerLiveRoom/index.tsx', root), 'utf8');
  const button = readFileSync(new URL('src/components/ShareLiveButton.tsx', root), 'utf8');
  const auth = readFileSync(new URL('supabase/functions/livekit-token/authorization.mjs', root), 'utf8');
  assert.match(host, /<ShareLiveButton compact streamId=\{streamId\}/);
  assert.match(viewer, /<ShareLiveButton streamId=\{streamId\}/);
  assert.match(button, /buildLiveInviteUrl\(window\.location\.origin, streamId\)/);
  assert.match(button, /navigator\.share/);
  assert.match(button, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(auth, /canPublish: stream\.user_id === userId/);
});

test('shared links join only a currently active livestream with database authorization', () => {
  const root = new URL('../../', import.meta.url);
  const grid = readFileSync(new URL('src/components/LiveStreamGrid.tsx', root), 'utf8');
  const app = readFileSync(new URL('src/App.tsx', root), 'utf8');
  assert.match(grid, /readLiveInvite\(window\.location\.search\)/);
  assert.match(grid, /\.eq\('id', invitedStreamId\)\.eq\('is_live', true\)\.maybeSingle\(\)/);
  assert.match(grid, /if \(data\.user_id === myUserId\)/);
  assert.match(grid, /setActiveStream\(streamFromRow\(data\)\)/);
  assert.match(grid, /clearLiveInviteUrl\(window\.location\.href\)/);
  assert.match(app, /!user && readLiveInvite\(window\.location\.search\)/);
  assert.match(app, /setShowAuth\(true\)/);
});
