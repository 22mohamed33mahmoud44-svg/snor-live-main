import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../src/utils/timedCallTokenRequest.ts', import.meta.url), 'utf8');

test('video calls have a bounded token request with cancellation on retry/unmount', () => {
  assert.match(call, /import \{ beginTimedCallTokenRequest \} from '\.\/utils\/timedCallTokenRequest'/);
  const effect = call.slice(call.indexOf('// The Edge Function may never resolve'),
    call.indexOf('// Getting a token is not proof'));
  assert.match(effect, /return beginTimedCallTokenRequest\(/);
  assert.match(effect, /supabase\.functions\.invoke\('livekit-token'/);
  assert.match(effect, /20_000/);
  assert.match(effect, /result\.status === 'timeout' \? 'connection_timeout' : 'connection_failed'/);
  assert.match(effect, /setTokenLoading\(false\)/);
  assert.match(effect, /\[matchId, userId, retryKey\]/);
  assert.match(helper, /if \(settled\) return/);
  assert.match(helper, /clearTimeout\(timeoutId\)/);
});

test('call room connection has a second timeout that clears once connected', () => {
  const effect = call.slice(call.indexOf('// Getting a token is not proof'),
    call.indexOf('  const leaveFailedCall', call.indexOf('// Getting a token is not proof')));
  assert.match(effect, /if \(!token \|\| roomConnected \|\| error\) return/);
  assert.match(effect, /window\.setTimeout\(\(\) => \{/);
  assert.match(effect, /30_000/);
  assert.match(effect, /setError\(previous => previous \?\? 'connection_timeout'\)/);
  assert.match(effect, /window\.clearTimeout\(connectionTimeout\)/);
  assert.match(effect, /\[token, roomConnected, error\]/);
  assert.match(call, /onConnected=\{\(\) => \{/);
  assert.match(call, /onDisconnected=\{\(\) => \{/);
});

test('retry obtains a fresh room and ignores old disconnect/errors', () => {
  assert.match(call, /const activeRoomAttemptRef = useRef\(roomAttemptId\)/);
  assert.match(call, /activeRoomAttemptRef\.current = `\$\{matchId\}-\$\{retryKey \+ 1\}`/);
  assert.match(call, /setRetryKey\(key => key \+ 1\)/);
  assert.match(call, /key=\{roomAttemptId\}/);
  assert.match(call, /if \(activeRoomAttemptRef\.current !== roomAttemptId\) return/);
  assert.match(call, /if \(activeRoomAttemptRef\.current === roomAttemptId\) setError\(classifyLiveKitError\(liveKitError\)\)/);
  assert.match(call, /setRoomConnected\(false\)/);
});

test('timeout error displays reconnect and safe exit without leaving a stuck spinner', () => {
  assert.match(call, /connection_timeout: \{[\s\S]*?showRetry: true, showEnd: true/);
  assert.match(call, /if \(error\) \{/);
  assert.match(call, /onClick=\{retryConnection\}/);
  assert.match(call, /onClick=\{\(\) => \{ void leaveFailedCall\(\); \}\}/);
  assert.match(call, /if \(tokenLoading \|\| !token\) return/);
});
