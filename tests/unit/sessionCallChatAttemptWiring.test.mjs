import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const writer = readFileSync(new URL('../../src/utils/idempotentCallChatWriter.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../src/utils/sessionCallChatAttemptStore.ts', import.meta.url), 'utf8');

test('call chat stores per-sender and per-match retry UUID in tab-scoped session storage', () => {
  assert.match(call, /import \{ createSessionCallChatAttemptStore \} from '\.\/utils\/sessionCallChatAttemptStore'/);
  assert.match(call, /sessionStorageForCall = window\.sessionStorage/);
  assert.match(call, /try \{ sessionStorageForCall = window\.sessionStorage; \} catch/);
  assert.match(call, /createSessionCallChatAttemptStore\(\s*sessionStorageForCall,/);
  assert.match(call, /snor:call-chat-pending:\$\{matchId\}:\$\{userId\}/);
  assert.match(call, /createIdempotentCallChatWriter<CallChatMessage>\(/);
  assert.match(call, /\s+attemptStore,\s*\)/);
});

test('pending UUID is saved before the network write and loaded on the next component instance', () => {
  assert.match(writer, /await persistence\?\.load\(message\)/);
  assert.match(writer, /pending = \{ id: storedId \?\? createId\(\), message \}/);
  assert.match(writer, /await persistence\?\.save\(pending\.id, message\)/);
  assert.ok(writer.indexOf('await persistence?.save(pending.id, message)') <
    writer.indexOf('const inserted = await insertOnce(attempt.id, attempt.message)'),
    'attempt ID must reach storage before ambiguous network insert');
  assert.equal((writer.match(/persistence\?\.clear\(attempt\.id\)/g) ?? []).length, 2,
    'both direct confirmation and recovery SELECT should clear saved metadata');
});

test('no plaintext message draft enters session storage and expiry bounds old retries', () => {
  assert.match(store, /crypto\.subtle\.digest\('SHA-256', bytes\)/);
  assert.match(store, /JSON\.stringify\(\{ id, fingerprint, savedAt: now\(\) \}\)/);
  assert.doesNotMatch(store, /JSON\.stringify\(\{\s*(?:message|draft)/,
    'raw messages must not be written to sessionStorage');
  assert.match(store, /CALL_CHAT_ATTEMPT_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(store, /now\(\) - saved\.savedAt > CALL_CHAT_ATTEMPT_TTL_MS/);
  assert.match(store, /if \(loadSaved\(\)\?\.id === id\) storage\?\.removeItem\(key\)/,
    'cleanup from older attempt must not clear the newer ID');
});
