import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const end = readFileSync(new URL('../../src/utils/endMatchOnServer.ts', import.meta.url), 'utf8');
const confirmation = readFileSync(new URL('../../src/utils/confirmMatchEnded.ts', import.meta.url), 'utf8');

test('failed video token connection allows safe, retryable hangup on errors or rejected network', () => {
  const failedExit = call.slice(call.indexOf('  const leaveFailedCall = async () => {'), call.indexOf('  const retryConnection =', call.indexOf('  const leaveFailedCall')));
  assert.match(failedExit, /if \(leavingRef\.current\) return/);
  assert.match(failedExit, /setLeaving\(true\)/);
  assert.match(failedExit, /try \{[\s\S]*await endMatchOnServer\(matchId\)/);
  assert.match(failedExit, /catch \(error\) \{[\s\S]*setLeaveError\(/);
  assert.match(failedExit, /finally \{[\s\S]*leavingRef\.current = false;[\s\S]*if \(navigationGuard\.isActive\(\)\) setLeaving\(false\)/);
  assert.match(call, /disabled=\{leaving\} onClick=\{\(\) => \{ void leaveFailedCall\(\); \}\}/);
  assert.match(call, /\{leaveError && <p role="alert">/);
});

test('normal call exit/next does not navigate until server confirms the match ended', () => {
  const handler = call.slice(call.indexOf('  const triggerEndMatch = async ('), call.indexOf('  const sendMessage = async', call.indexOf('  const triggerEndMatch')));
  assert.match(handler, /if \(endingRef\.current\) return/);
  assert.match(handler, /confirmedEnded = await endMatchOnServer\(matchId\)/);
  assert.match(handler, /if \(!confirmedEnded\) \{[\s\S]*setEndError\(/);
  assert.match(handler, /catch \(error\) \{[\s\S]*setEndError\(/);
  assert.match(handler, /finally \{[\s\S]*if \(!confirmedEnded && navigationGuard\.isActive\(\)\) endingRef\.current = false/);
  assert.ok(handler.indexOf('if (!confirmedEnded)') < handler.indexOf('onNext()'),
    'navigation happens without verifying server end');
  assert.match(call, /\{endError && <p className="vc-media-error" role="alert">\{endError\}<\/p>\}/);
  assert.doesNotMatch(handler, /window\.alert\(/, 'inline error feedback should replace blocking browser alert');
});

test('server helper remains participant-scoped and rejects unknown match status/network errors', () => {
  assert.match(end, /confirmMatchEnded\(/);
  assert.match(end, /\.eq\('id', matchId\)/);
  assert.match(end, /\.eq\('status', 'active'\)/);
  assert.match(end, /\.select\('id'\)/);
  assert.match(end, /\.select\('status'\)/);
  assert.match(confirmation, /if \(!updated \|\| updated\.error\) return false/);
  assert.match(confirmation, /checked\.data\?\.status === 'ended'/);
  assert.match(confirmation, /catch \(error\) \{/);
});
