/// <reference lib="deno.ns" />
import { mergeStreamChatHistory } from '../../src/utils/mergeStreamChatHistory.ts';

function assert(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
type CallMessage = { id: string; sender_id: string; message: string; created_at: string };
const item = (id: string, second: number, sender_id = 'alice'): CallMessage => ({
  id,
  sender_id,
  message: 'msg-' + id,
  created_at: new Date(Date.UTC(2026, 9, 31, 1, 0, second)).toISOString(),
});

Deno.test('call-chat reconnect restores latest persisted messages chronologically', () => {
  const newestFirst = [item('3', 3), item('2', 2), item('1', 1)];
  const result = mergeStreamChatHistory(newestFirst.slice().reverse(), [], 30);
  assert(result.map(x => x.id).join(',') === '1,2,3',
    'a reconnect must restore persisted conversation in chronological order');
  assert(newestFirst[0].id === '3',
    'source rows were unexpectedly changed in place');
});

Deno.test('late history response preserves a newer Realtime call message', () => {
  const receivedDuringRequest = [item('new', 5, 'bob')];
  const historical = [item('old', 1), item('older', 2), item('oldest', 3)];
  const result = mergeStreamChatHistory(historical, receivedDuringRequest, 30);
  assert(result.some(x => x.id === 'new'), 'late DB read erased a new chat message');
  assert(result.at(-1)?.id === 'new', 'new Realtime message should display last');
});

Deno.test('overlapping Realtime and history rows appear once, with newest 30 retained', () => {
  const historical = Array.from({ length: 30 }, (_, i) => item(String(i), i));
  const realtime = [item('29', 29), item('30', 30, 'bob')];
  const result = mergeStreamChatHistory(historical, realtime, 30);
  assert(result.length === 30, 'history/realtime merge exceeded chat window');
  assert(result.filter(x => x.id === '29').length === 1,
    'overlapping server rows duplicated in the call chat');
  assert(result[0].id === '1' && result.at(-1)?.id === '30',
    'latest window did not retain newest message');
});

Deno.test('empty history never deletes messages received while the query was pending', () => {
  const realtime = [item('live', 9)];
  const result = mergeStreamChatHistory([], realtime, 30);
  assert(result.length === 1 && result[0].id === 'live',
    'empty database snapshot erased a freshly delivered message');
});
