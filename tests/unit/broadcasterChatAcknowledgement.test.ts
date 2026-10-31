/// <reference lib="deno.ns" />
import { createCallMessageSender } from '../../src/utils/callMessageSender.ts';
import { acknowledgeStreamChatMessage, mergeStreamChatHistory } from '../../src/utils/mergeStreamChatHistory.ts';

function assert(ok: unknown, description: string) {
  if (!ok) throw new Error(description);
}
type Bubble = {
  id: string; user: string; userId: string; text: string;
  color: string; created_at?: string; isOptimistic?: boolean;
};
type Row = {
  id: string; stream_id: string; user_id: string; username: string;
  message: string; created_at: string;
};
const streamer = 'broadcaster';
const ack = (row: Row): Bubble => ({
  id: row.id, user: row.username, userId: row.user_id, text: row.message,
  color: '#ff2a74', created_at: row.created_at, isOptimistic: false,
});
const persisted = (id: string, second: number, message = 'hello'): Row => ({
  id, stream_id: 'stream-1', user_id: streamer, username: 'المذيع',
  message, created_at: new Date(Date.UTC(2026, 9, 31, 12, 0, second)).toISOString(),
});
const pending = (id: string, message = 'hello'): Bubble => ({
  id, user: 'المذيع', userId: streamer, text: message,
  color: '#ff2a74', isOptimistic: true,
});

Deno.test('broadcaster confirms its own message without a Realtime echo', async () => {
  const saved = persisted('server-1', 1);
  const sender = createCallMessageSender<Row>(async message => ({
    data: { ...saved, message }, error: null,
  }));
  let visible: Bubble[] = [pending('opt-1')];
  const result = await sender.send('  hello  ');
  assert(result.status === 'sent' && result.data?.id === 'server-1', 'DB ID not confirmed');
  if (result.status === 'sent' && result.data?.id) {
    visible = acknowledgeStreamChatMessage(visible, 'opt-1', ack(result.data), 30);
  }
  assert(visible.length === 1 && visible[0].id === 'server-1' && !visible[0].isOptimistic,
    'broadcaster pending bubble stayed stuck without a realtime event');
});

Deno.test('two identical sent drafts are acknowledged by their own optimistic IDs', () => {
  let visible: Bubble[] = [pending('opt-first'), pending('opt-second')];
  // The second request completes first and must not consume the first bubble.
  visible = acknowledgeStreamChatMessage(visible, 'opt-second', ack(persisted('db-second', 2)), 30);
  assert(visible.some(m => m.id === 'opt-first' && m.isOptimistic),
    'same-text second send stole the first pending bubble');
  assert(!visible.some(m => m.id === 'opt-second'), 'second pending ID remained after acknowledgement');
  visible = acknowledgeStreamChatMessage(visible, 'opt-first', ack(persisted('db-first', 1)), 30);
  assert(visible.length === 2 && visible.every(m => !m.isOptimistic),
    'two separate persisted messages were merged or left pending');
  assert(visible.map(m => m.id).join(',') === 'db-first,db-second',
    'chronological order of identical messages is wrong');
});

Deno.test('historical and delayed Realtime delivery cannot duplicate confirmed broadcaster rows', () => {
  const saved = ack(persisted('db-one', 1));
  let visible: Bubble[] = [pending('opt-one')];
  visible = acknowledgeStreamChatMessage(visible, 'opt-one', saved, 30);
  visible = mergeStreamChatHistory([saved], visible, 30);
  visible = mergeStreamChatHistory([saved], visible, 30);
  assert(visible.length === 1 && visible[0].id === saved.id,
    'history/realtime created duplicate broadcaster bubble');
});

Deno.test('another viewer message survives broadcaster acknowledgement and failed sends roll back', async () => {
  const viewer: Bubble = {
    id: 'viewer-1', user: 'مشاهد', userId: 'viewer',
    text: 'مرحبا', color: '#60a5fa', created_at: '2026-10-31T12:00:03.000Z',
  };
  const saved = ack(persisted('db-host', 2));
  const visible = acknowledgeStreamChatMessage([pending('opt-host'), viewer], 'opt-host', saved, 30);
  assert(visible.length === 2 && visible.some(m => m.id === 'viewer-1'),
    'incoming viewer message disappeared during broadcaster acknowledgement');

  const failed = createCallMessageSender<Row>(async () => ({ data: null, error: new Error('offline') }));
  const result = await failed.send('hello');
  assert(result.status === 'failed', 'offline write falsely confirmed');
  const afterRollback = [pending('opt-unsent'), viewer].filter(m => m.id !== 'opt-unsent');
  assert(afterRollback.length === 1 && afterRollback[0].id === 'viewer-1',
    'failure rollback affected unrelated chat message');
});
