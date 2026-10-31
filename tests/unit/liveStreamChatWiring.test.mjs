import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Wiring guards for the browser UI. Pure network/error/concurrency behavior
// is covered by tests/unit/callMessageSender.test.ts (Deno).
const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');
const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');

test('broadcaster waits for server confirmation before clearing the text draft', () => {
  const componentStart = broadcaster.indexOf('const ChatInputArea = memo(');
  const componentEnd = broadcaster.indexOf('// ── EndStreamModal', componentStart);
  assert.ok(componentStart >= 0 && componentEnd > componentStart);
  const component = broadcaster.slice(componentStart, componentEnd);
  assert.match(component, /Promise<boolean>/);
  assert.match(component, /sendingRef\.current/);
  assert.match(component, /if \(await onSendMessage\(draft\)\)/);
  assert.match(component, /setChatInput\(current => current === draft \? '' : current\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /<form\b[^>]*onSubmit=/);
  assert.doesNotMatch(component, /setChatInput\(''\)/, 'draft cannot disappear before the write succeeds');
});

test('broadcaster rolls back the optimistic bubble on network/database failure', () => {
  assert.match(broadcaster, /createCallMessageSender<StreamChatMessage>\(async \(message: string\)/);
  assert.match(broadcaster, /await messageSender\.send\(text\)/);
  assert.match(broadcaster, /if \(result\.status !== 'sent'\)/);
  assert.match(broadcaster, /prev\.filter\(message => message\.id !== optimisticId\)/);
});

test('viewer retains its draft until confirmed and does not block on thrown network errors', () => {
  const start = viewer.indexOf('const handleSendMessage = async (');
  const end = viewer.indexOf('  // 🚀 دالة الإعجاب', start);
  assert.ok(start >= 0 && end > start);
  const handler = viewer.slice(start, end);
  assert.match(viewer, /createCallMessageSender<ChatMessage>\(async \(message: string\)/);
  assert.match(handler, /messageSender\.isSending\(\)/);
  assert.match(handler, /await messageSender\.send\(text\)/);
  assert.match(handler, /if \(result\.status === 'sent' && result\.data\?\.id\)/);
  assert.match(handler, /setNewMessage\(current => current === draft \? '' : current\)/);
  assert.doesNotMatch(handler, /setNewMessage\(''\)/, 'viewer draft must survive failed inserts');
  assert.match(handler, /finally\s*\{\s*setSending\(false\)/);
  assert.match(handler, /prev\.filter\(message => message\.id !== localId\)/);
});

test('replayed realtime stream messages cannot duplicate the same server message', () => {
  assert.match(viewer, /prev\.some\(m => m\.id === newMsg\.id\)/);
  assert.match(broadcaster, /newMsg\.user_id === myUserId\) return/,
    'broadcaster receives its own saved message via the INSERT response');
  assert.match(broadcaster, /mergeStreamChatHistory\(\[\{/,
    'other viewers messages should deduplicate through bounded history merge');
});


test('viewer replaces acknowledged optimistic ID with persisted stream_chat row', () => {
  assert.match(viewer, /createCallMessageSender<ChatMessage>\(async \(message: string\)/);
  assert.match(viewer, /\.select\('id, stream_id, user_id, username, message, created_at'\)\s*\.single\(\)/,
    'viewer must request the inserted row to obtain a real server ID');
  assert.match(viewer, /!data\?\.id \? new Error\('Missing persisted stream_chat ID'\)/,
    'a successful response without a persisted ID cannot confirm delivery');
  assert.match(viewer, /acknowledgeStreamChatMessage\(\s*current, localId, result\.data!, MESSAGES_LIMIT/,
    'successful send must replace its temporary bubble with the server row');
  assert.match(viewer, /newMsg\.user_id === currentMyUserId\) return/,
    'own Realtime inserts are intentionally reconciled via the returned server ID');
});

test('broadcaster confirms its outgoing bubble by saved row ID without relying on Realtime', () => {
  assert.match(broadcaster, /createCallMessageSender<StreamChatMessage>\(async \(message: string\)/);
  assert.match(broadcaster, /\.from\('stream_chat'\)\.insert\(\[\{/);
  assert.match(broadcaster, /\.select\('id, stream_id, user_id, username, message, created_at'\)\s*\.single\(\)/);
  assert.match(broadcaster, /!data\?\.id \? new Error\('Missing persisted broadcaster chat ID'\)/);
  const start = broadcaster.indexOf('const handleSendMessage = useCallback(');
  const end = broadcaster.indexOf('  //', start+80);
  const send = broadcaster.slice(start, broadcaster.indexOf('  }, [', start));
  assert.ok(start > 0 && send.length > 250, 'broadcaster chat send callback missing');
  assert.match(send, /result\.status !== 'sent' \|\| !result\.data\?\.id/);
  assert.match(send, /acknowledgeStreamChatMessage\(prev, optimisticId, \{/);
  assert.match(send, /id: saved\.id, user: saved\.username, userId: saved\.user_id/);
  assert.match(send, /text: saved\.message, color: '#ff2a74', created_at: saved\.created_at/);
  assert.match(send, /prev\.filter\(message => message\.id !== optimisticId\)/);
  assert.doesNotMatch(send, /Realtime swaps the optimistic message/,
    'outgoing delivery should not rely on a Realtime echo');
});

test('broadcaster does not guess optimistic messages by text from untrusted Realtime events', () => {
  const start = broadcaster.indexOf(".on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat'");
  const end = broadcaster.indexOf(".on('broadcast', { event: 'like' }", start);
  const listener = broadcaster.slice(start, end);
  assert.ok(start > 0 && end > start, 'stream chat listener missing');
  assert.match(listener, /if \(!isMounted\) return/);
  assert.match(listener, /if \(newMsg\.user_id === myUserId\) return/);
  assert.match(listener, /mergeStreamChatHistory\(\[\{/);
  assert.doesNotMatch(listener, /m\.text === newMsg\.message/,
    'two identical sent drafts could acknowledge the wrong optimistic bubble');
});
