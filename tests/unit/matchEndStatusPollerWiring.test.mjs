import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const watcher = readFileSync(new URL('../../src/utils/matchEndStatusPoller.ts', import.meta.url), 'utf8');

test('call UI shares one match-ended status query across initial and 3-second polls', () => {
  assert.match(call, /import \{ createMatchEndStatusPoller \} from '\.\/utils\/matchEndStatusPoller'/);
  const effect = call.slice(call.indexOf('  // Match status, not a signal inserted after ending'),
    call.indexOf('  const triggerEndMatch = async'));
  assert.match(effect, /const endStatusPoller = createMatchEndStatusPoller\(/);
  assert.match(effect, /\.from\('matches'\)/);
  assert.match(effect, /\.select\('status'\)/);
  assert.match(effect, /\.eq\('id', matchId\)/);
  assert.match(effect, /\.abortSignal\(signal\)/,
    'timeout controller must abort the actual PostgREST request');
  assert.match(effect, /const checkEnded = \(\) => endStatusPoller\.check\(\)/);
  assert.match(effect, /void checkEnded\(\)/);
  assert.match(effect, /setInterval\(\(\) => \{ void checkEnded\(\); \}, 3000\)/);
  assert.doesNotMatch(effect, /const checkEnded = async \(\) => \{/,
    'UI must not create a fresh unbounded status query per timer tick');
});

test('unmount invalidates status callbacks before stopping timer and removing the Realtime channel', () => {
  const dispose = call.slice(call.indexOf('    return () => {\n      disposed = true;', call.indexOf('const endStatusPoller')),
    call.indexOf('  }, [matchId, userId, playSFX]);', call.indexOf('const endStatusPoller')));
  assert.match(dispose, /disposed = true;\s*endStatusPoller\.dispose\(\);\s*clearInterval\(poll\);/);
  assert.match(dispose, /void supabase\.removeChannel\(channel\)/);
  assert.match(watcher, /if \(disposed \|\| ended\) return Promise\.resolve\(\)/);
  assert.match(watcher, /\.then\(\(\) => disposed \|\| controller\.signal\.aborted \? null : readStatus\(controller\.signal\)\)/);
  assert.match(watcher, /if \(disposed \|\| ended \|\| controller\.signal\.aborted \|\| !result \|\| result\.error\) return;/);
});

test('poller is single-flight, catches network exceptions, and reports ended only once', () => {
  assert.match(watcher, /if \(inFlight\) return inFlight/);
  assert.match(watcher, /if \(result\.data\?\.status === 'ended'\) \{/);
  assert.match(watcher, /ended = true;\s*onEnded\(\)/);
  assert.match(watcher, /\.catch\(error => \{/);
  assert.match(watcher, /if \(!disposed && !controller\.signal\.aborted\) \{/);
  assert.match(watcher, /if \(inFlight === task\) inFlight = null/);
  assert.match(watcher, /MATCH_END_STATUS_TIMEOUT_MS = 12_000/);
  assert.match(watcher, /const controller = new AbortController\(\)/);
  assert.match(watcher, /const deadline = setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(watcher, /Promise\.race\(\[request, aborted\]\)/);
  assert.match(watcher, /controller\.signal\.aborted/);
  assert.match(watcher, /clearTimeout\(deadline\)/);
  assert.match(watcher, /activeController\?\.abort\(\)/);
});
