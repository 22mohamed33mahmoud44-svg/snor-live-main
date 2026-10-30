/// <reference lib="deno.ns" />
import { mergeStreamChatHistory } from '../../src/utils/mergeStreamChatHistory.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

type Msg = { id: string; created_at?: string; text: string };
const at = (id: string, minute: number): Msg => ({
  id, created_at: `2026-10-30T14:${String(minute).padStart(2, '0')}:00+00:00`, text: id,
});

Deno.test('late history cannot erase a Realtime message received during loading', () => {
  const received = [at('fresh', 4)];
  const history = [at('older', 1), at('old', 2), at('overlap', 3)];
  const result = mergeStreamChatHistory(history, received);
  assert(result.map(m => m.id).join(',') === 'older,old,overlap,fresh',
    'newer message was lost while older history resolved');
  assert(received.length === 1 && history.length === 3, 'input arrays were mutated');
});

Deno.test('duplicate server IDs are merged once and existing local version wins', () => {
  const history = [at('a', 1), at('overlap', 2)];
  const current = [{ ...at('overlap', 2), text: 'realtime copy' }, at('latest', 3)];
  const result = mergeStreamChatHistory(history, current);
  assert(result.length === 3, 'overlapping row duplicated');
  assert(result.find(m => m.id === 'overlap')?.text === 'realtime copy',
    'local message with same ID should take precedence');
});

Deno.test('a reconnect history refresh can introduce newer rows than local cache', () => {
  const current = [at('old-1', 1), at('old-2', 2)];
  const history = [at('old-2', 2), at('new-3', 3), at('new-4', 4)];
  const result = mergeStreamChatHistory(history, current, 3);
  assert(result.map(m => m.id).join(',') === 'old-2,new-3,new-4',
    'cached older messages displaced newer server history');
});

Deno.test('pending local bubble stays visible until the server confirms sending', () => {
  const current = [{ id: 'pending-123', text: 'unconfirmed draft' }, at('live', 4)];
  const result = mergeStreamChatHistory([at('old', 1)], current);
  assert(result.map(m => m.id).join(',') === 'old,live,pending-123',
    'unsent optimistic bubble was cleared or incorrectly sorted');
});

Deno.test('only the most recent configured number of messages remain', () => {
  const recent = Array.from({ length: 40 }, (_, i) => ({
    id: `message-${i}`,
    created_at: new Date(Date.UTC(2026, 9, 30, 14, 0, i)).toISOString(),
    text: 'msg',
  }));
  const result = mergeStreamChatHistory(recent, [], 30);
  assert(result.length === 30, 'message cap was not enforced');
  assert(result[0].id === 'message-10' && result.at(-1)?.id === 'message-39',
    'oldest rather than newest messages were kept');
  assert(mergeStreamChatHistory(recent, [], 0).length === 0,
    'zero-limit history unexpectedly retained messages');
});
