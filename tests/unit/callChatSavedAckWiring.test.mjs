import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');

test('call chat insert uses a stable UUID and verifies server confirmation', () => {
  assert.match(source, /createIdempotentCallChatWriter<CallChatMessage>\(/);
  assert.match(source, /\(\) => crypto\.randomUUID\(\)/);
  assert.match(source, /\.from\('messages'\)\.upsert\(\{/);
  assert.match(source, /id, match_id: matchId, sender_id: userId, message/);
  assert.match(source, /onConflict: 'id', ignoreDuplicates: true/);
  assert.match(source, /\.select\('id, sender_id, message, created_at'\)/);
  assert.match(source, /\.maybeSingle\(\)/);
  assert.match(source, /\.eq\('id', id\)/);
  assert.match(source, /\.eq\('match_id', matchId\)/);
  assert.match(source, /\.eq\('sender_id', userId\)/);
  assert.match(source, /createCallMessageSender<CallChatMessage>\(message => writer\.persist\(message\)\)/);
});

test('outgoing saved row is merged into chat by server ID and does not clear newer text', () => {
  const start = source.indexOf('  const sendMessage = async () => {');
  const end = source.indexOf('  const openChat = ', start);
  assert.ok(start !== -1 && end > start, 'call message sender handler is missing');
  const send = source.slice(start, end);
  assert.match(send, /const draft = input/);
  assert.match(send, /messageSender\.isSending\(\)/);
  assert.match(send, /if \(result\.status === 'sent' && result\.data\?\.id\)/);
  assert.match(send, /setMessages\(current => mergeStreamChatHistory<CallChatMessage>\(\s*\[result\.data!\], current, CALL_CHAT_HISTORY_LIMIT/);
  assert.ok(send.indexOf('setMessages(current =>') < send.indexOf('setInput(current =>'),
    'acknowledged server row must be merged before clearing the composer');
  assert.match(send, /setInput\(current => current === draft \? '' : current\)/);
  assert.match(send, /setChatSendError\('تعذر إرسال الرسالة/);
  assert.doesNotMatch(send, /setInput\(''\)/,
    'a failure or new draft must not clear the input');
});

test('incoming Realtime and history share the same bounded deduplicating merge', () => {
  assert.match(source, /setMessages\(prev => mergeStreamChatHistory<CallChatMessage>\(\[incoming\], prev, CALL_CHAT_HISTORY_LIMIT\)\)/);
  assert.match(source, /setMessages\(current => mergeStreamChatHistory<CallChatMessage>\(\s*data\.slice\(\)\.reverse\(\), current, CALL_CHAT_HISTORY_LIMIT/);
  assert.match(source, /const CALL_CHAT_HISTORY_LIMIT = 30/);
});
