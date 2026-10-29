import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRoom } from './authorization.mjs';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const eve = '33333333-3333-4333-8333-333333333333';
const room = '44444444-4444-4444-8444-444444444444';

const lookup = (match = null, stream = null) => [
  async () => match,
  async () => stream,
];

test('rejects forged legacy direct-call room names without hitting the database', async () => {
  let calls = 0;
  const getter = async () => { calls += 1; return null; };
  assert.deepEqual(await authorizeRoom('snor_call_' + alice + '_' + bob + '_123', alice, getter, getter),
    { authorized: false, canPublish: false, kind: null });
  assert.equal(calls, 0);
});

test('allows either actual participant to publish in an active match', async () => {
  const [getMatch, getStream] = lookup({ user1: alice, user2: bob, status: 'active' });
  for (const id of [alice, bob]) {
    assert.deepEqual(await authorizeRoom(room, id, getMatch, getStream),
      { authorized: true, canPublish: true, kind: 'match' });
  }
});

test('rejects unrelated users even with an exact match id', async () => {
  const [getMatch, getStream] = lookup({ user1: alice, user2: bob, status: 'active' });
  assert.equal((await authorizeRoom(room, eve, getMatch, getStream)).authorized, false);
});

test('never issues a token for pending or ended calls', async () => {
  for (const status of ['pending', 'ended']) {
    const [getMatch, getStream] = lookup({ user1: alice, user2: bob, status });
    assert.equal((await authorizeRoom(room, alice, getMatch, getStream)).authorized, false);
  }
});

test('allows live stream owner to publish and viewers to subscribe', async () => {
  const [getMatch, getStream] = lookup(null, { user_id: alice, is_live: true });
  assert.deepEqual(await authorizeRoom(room, alice, getMatch, getStream),
    { authorized: true, canPublish: true, kind: 'stream' });
  assert.deepEqual(await authorizeRoom(room, eve, getMatch, getStream),
    { authorized: true, canPublish: false, kind: 'stream' });
});

test('rejects offline streams including for the owner', async () => {
  const [getMatch, getStream] = lookup(null, { user_id: alice, is_live: false });
  assert.equal((await authorizeRoom(room, alice, getMatch, getStream)).authorized, false);
});

test('does not fall back to stream lookup for a known but forbidden match', async () => {
  let streamReads = 0;
  const getMatch = async () => ({ user1: alice, user2: bob, status: 'ended' });
  const getStream = async () => { streamReads += 1; return { user_id: alice, is_live: true }; };
  assert.equal((await authorizeRoom(room, alice, getMatch, getStream)).authorized, false);
  assert.equal(streamReads, 0);
});

test('database failures must be surfaced rather than allowing access', async () => {
  await assert.rejects(authorizeRoom(room, alice,
    async () => { throw new Error('database unavailable'); },
    async () => ({ user_id: alice, is_live: true })),
  /database unavailable/);
});
