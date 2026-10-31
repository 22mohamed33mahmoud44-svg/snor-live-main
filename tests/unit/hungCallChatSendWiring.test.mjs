import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const writer = readFileSync(new URL('../../src/utils/idempotentCallChatWriter.ts', import.meta.url), 'utf8');

test('call chat write and idempotent recovery SELECT use a shared abort signal', () => {
  const start = call.indexOf('    const writer = createIdempotentCallChatWriter<CallChatMessage>(');
  const end = call.indexOf('    return createCallMessageSender<CallChatMessage>', start);
  assert.ok(start >= 0 && end > start, 'call chat writer integration missing');
  const integration = call.slice(start, end);
  assert.match(integration, /async \(id, message, signal\) => \{/);
  assert.match(integration, /async \(id, signal\) => \{/);
  assert.equal((integration.match(/\.abortSignal\(signal\)/g) ?? []).length, 2,
    'both INSERT and recovery SELECT need the same abort signal');
  assert.match(integration, /onConflict: 'id', ignoreDuplicates: true/,
    'timeout retries must not duplicate a committed message');
  assert.match(integration, /\.eq\('id', id\)[\s\S]*\.eq\('match_id', matchId\)[\s\S]*\.eq\('sender_id', userId\)/);
  assert.match(integration, /attemptStore,/,
    'ambiguous timeout must retain session UUID for retry');
});

test('stalled sends are bounded and old aborted responses cannot clear the retry UUID', () => {
  assert.match(writer, /CALL_CHAT_SEND_TIMEOUT_MS = 20_000/);
  assert.match(writer, /const controller = new AbortController\(\)/);
  assert.match(writer, /const deadline = setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(writer, /Promise\.race\(\[writeAndConfirm\(\), aborted\]\)/);
  assert.match(writer, /controller\.signal\.addEventListener\('abort', onAbort, \{ once: true \}\)/);
  assert.match(writer, /if \(controller\.signal\.aborted\) return failed\(timeoutError\)/);
  assert.match(writer, /if \(pending\?\.id === attempt\.id\) pending = null/);
  assert.match(writer, /clearTimeout\(deadline\)/);
  assert.match(writer, /controller\.signal\.removeEventListener\('abort', onAbort\)/);
});

test('old completed/failed call sends cannot change an exited or newer call UI', () => {
  const start = call.indexOf('  const sendMessage = async () => {');
  const end = call.indexOf('  const openChat = ', start);
  const send = call.slice(start, end);
  assert.match(send, /if \(!draft\.trim\(\) \|\| messageSender\.isSending\(\) \|\| !navigationGuard\.isActive\(\)\) return/);
  assert.match(send, /const result = await messageSender\.send\(draft\);\s*\/\/[^\n]*\n[^\n]*\n\s*if \(!navigationGuard\.isActive\(\)\) return;/);
  assert.match(send, /finally \{\s*if \(navigationGuard\.isActive\(\)\) setSendingMessage\(false\)/);
  assert.match(send, /if \(result\.status === 'sent' && result\.data\?\.id\)/);
  assert.match(send, /setInput\(current => current === draft \? '' : current\)/);
  assert.match(send, /setChatSendError\('تعذر إرسال الرسالة/);
});
