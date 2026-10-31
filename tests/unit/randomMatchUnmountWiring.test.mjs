import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../../src/RandomMatch.tsx', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../src/utils/cancelRandomMatch.ts', import.meta.url), 'utf8');

test('button cancel and screen unmount share the same pending-aware cleanup', () => {
  assert.match(component, /const finishRandomSearch = useCallback\(\(\): Promise<boolean> => \{/);
  assert.match(component, /cancelRandomSearchAfterPending\(\s*pendingStartRef\.current/);
  assert.match(component, /if \(cancelTaskRef\.current\) return cancelTaskRef\.current/);
  assert.match(component, /if \(!\(await finishRandomSearch\(\)\)\)/);
  assert.match(component, /void finishRandomSearch\(\)\.catch\(/);
  assert.doesNotMatch(component, /cancelMatching\(userIdRef\.current\)\.catch/,
    'unmount must not call cancel_waiting ahead of in-flight startMatching');
});

test('unmount blocks delayed matching and handles already-pending cancellation', () => {
  const cleanup = component.slice(component.indexOf('// An unmounted component must never'));
  assert.match(cleanup, /phaseRef\.current === 'waiting'/);
  assert.match(cleanup, /phaseRef\.current === 'cancelling'/);
  assert.match(cleanup, /phaseRef\.current = 'cancelling'/);
  assert.match(cleanup, /stopSearchResources\(\)/);
  assert.match(component, /if \(matchedRef\.current \|\| phaseRef\.current !== 'waiting'\) return/);
  assert.match(component, /if \(matchedRef\.current \|\| cancellingRef\.current/);
});

test('stray lookup and termination remain scoped to active random calls', () => {
  assert.match(component, /\.eq\('status', 'active'\)/);
  assert.match(component, /\.eq\('kind', 'random'\)/);
  assert.match(component, /\.or\(\x60user1\.eq\.\$\{account\},user2\.eq\.\$\{account\}\x60\)/);
  assert.match(helper, /match\.kind !== 'random' \|\| match\.status !== 'active'/);
  assert.match(component, /onClick=\{phase === 'error' && cancelFailedRef\.current \? handleCancel : handleStart\}/,
    'cancellation failure must retry cleanup rather than enqueue another match');
});
