import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');

test('both failed-connect room and connected call dispose their own navigation guard', () => {
  assert.match(call, /import \{ createCallNavigationGuard \} from '\.\/utils\/callNavigationGuard'/);
  assert.equal((call.match(/const navigationGuard = useMemo\(\(\) => createCallNavigationGuard\(\), \[matchId\]\)/g) ?? []).length, 2);
  assert.equal((call.match(/useEffect\(\(\) => \(\) => navigationGuard\.dispose\(\), \[navigationGuard\]\)/g) ?? []).length, 2);
});

test('old failed-call leave result cannot clear the newer match', () => {
  const start = call.indexOf('  const leaveFailedCall = async () => {');
  const end = call.indexOf('  const retryConnection =', start);
  const handler = call.slice(start, end);
  assert.match(handler, /if \(await endMatchOnServer\(matchId\)\) \{/);
  assert.match(handler, /if \(navigationGuard\.claim\(\)\) onEnd\(\)/);
  assert.match(handler, /else if \(navigationGuard\.isActive\(\)\)/);
  assert.match(handler, /if \(navigationGuard\.isActive\(\)\) setLeaveError\(/);
  assert.match(handler, /if \(navigationGuard\.isActive\(\)\) setLeaving\(false\)/);
});

test('Realtime end event and awaited connected-call hangup only navigate once', () => {
  const check = call.slice(call.indexOf('    const handleEnded = () => {'),
    call.indexOf('    // An offline/slow status query'));
  assert.match(check, /if \(disposed \|\| endingRef\.current \|\| !navigationGuard\.claim\(\)\) return/);
  const handler = call.slice(call.indexOf("  const triggerEndMatch = async ("),
    call.indexOf('  const sendMessage = async'));
  assert.match(handler, /confirmedEnded = await endMatchOnServer\(matchId\)/);
  assert.match(handler, /if \(!navigationGuard\.claim\(\)\) return/);
  assert.ok(handler.indexOf('if (!navigationGuard.claim()) return') < handler.indexOf("if (action === 'next') onNext()"),
    'next navigation must be gated by active call identity');
  assert.match(handler, /if \(navigationGuard\.isActive\(\)\) setEndError\(/);
});

test('App scopes stale onEnd/onNext to original match and remounts new calls', () => {
  assert.match(app, /<VideoCall\s+key=\{currentMatch\.id\}/);
  assert.match(app, /setCurrentMatch\(previous => previous\?\.id === currentMatch\.id \? null : previous\)/);
  assert.match(app, /if \(currentMatchRef\.current\?\.id !== currentMatch\.id\) return/);
  assert.ok(app.includes('setShowRandomMatch(true)'), 'current call next should still open matchmaking');
});
