import { AccessToken, TrackSource } from 'npm:livekit-server-sdk@2';
import { authorizeRoom } from './authorization.mjs';

const room = '44444444-4444-4444-8444-444444444444';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

function assert(condition, description) {
  if (!condition) throw new Error(description);
}

async function signedVideoGrant(kind, call_type) {
  const auth = await authorizeRoom(room, alice,
    async () => ({ user1: alice, user2: bob, status: 'active', kind, call_type }),
    async () => null);
  assert(auth.authorized, 'participant should be authorized');
  const token = new AccessToken('test-livekit-api', 'local-test-secret-1234567890123456789', {
    identity: alice, ttl: '5m',
  });
  token.addGrant({
    roomJoin: true, room,
    canPublish: auth.canPublish,
    canSubscribe: true,
    ...('publishSources' in auth && auth.publishSources?.includes('microphone')
      ? { canPublishSources: [TrackSource.MICROPHONE] } : {}),
  });
  const jwt = await token.toJwt();
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.video;
}

Deno.test('signed audio-call JWT restricts publishing to microphone source', async () => {
  const grant = await signedVideoGrant('direct', 'audio');
  assert(grant.roomJoin === true, 'audio user must be able to join');
  assert(grant.canSubscribe === true, 'audio user must subscribe');
  assert(grant.canPublish === true, 'microphone must be publishable');
  assert(JSON.stringify(grant.canPublishSources) === JSON.stringify(['microphone']),
    'JWT must contain *only* microphone as publish source');
});

Deno.test('video direct calls preserve camera/microphone publishing', async () => {
  const grant = await signedVideoGrant('direct', 'video');
  assert(grant.canPublish === true, 'video caller needs publishing rights');
  assert(!grant.canPublishSources?.length, 'video call should not get audio-only restriction');
});

Deno.test('legacy random matches retain usual publishing grant', async () => {
  const grant = await signedVideoGrant('random', 'video');
  assert(grant.canPublish === true, 'random match must publish');
  assert(!grant.canPublishSources?.length, 'random match was inadvertently restricted');
});
