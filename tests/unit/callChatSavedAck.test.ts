/// <reference lib="deno.ns" />
import { createCallMessageSender } from '../../src/utils/callMessageSender.ts';
import { mergeStreamChatHistory } from '../../src/utils/mergeStreamChatHistory.ts';

function assert(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}

type Message = { id: string; sender_id: string; message: string; created_at?: string | null };
const saved: Message = {
  id: 'db-message-1', sender_id: 'caller-a', message: 'السلام عليكم',
  created_at: '2026-10-31T12:00:00Z',
};

Deno.test('confirmed outgoing call chat message is visible without a Realtime echo', async () => {
  const sender = createCallMessageSender<Message>(async text => ({
    data: { ...saved, message: text }, error: null,
  }));
  const result = await sender.send('  السلام عليكم  ');
  assert(result.status === 'sent' && result.data?.id === saved.id,
    'DB confirmation did not return saved message ID');
  let visible: Message[] = [];
  if (result.status === 'sent' && result.data?.id) {
    visible = mergeStreamChatHistory<Message>([result.data], visible, 30);
  }
  assert(visible.length === 1 && visible[0].message === saved.message,
    'successful write was not displayed without subscription events');
});

Deno.test('replayed Realtime and later history cannot duplicate the acknowledged call message', () => {
  const realTimeFirst = mergeStreamChatHistory<Message>([saved], [], 30);
  const confirmed = mergeStreamChatHistory<Message>([saved], realTimeFirst, 30);
  const loaded = mergeStreamChatHistory<Message>([saved], confirmed, 30);
  assert(loaded.length === 1 && loaded[0].id === saved.id,
    'one DB row was duplicated after Realtime, ack and history');
});

Deno.test('newer messages received during insertion stay in chronological order', () => {
  const other: Message = {
    id: 'db-message-2', sender_id: 'caller-b', message: 'أهلا',
    created_at: '2026-10-31T12:00:01Z',
  };
  const displayed = mergeStreamChatHistory<Message>([saved], [other], 30);
  assert(displayed.map(m => m.id).join(',') === 'db-message-1,db-message-2',
    'confirmed outgoing message displaced a newer incoming message');
});

Deno.test('missing persisted ID or rejected write cannot confirm outgoing chat', async () => {
  const noId = createCallMessageSender<Message>(async () => ({
    data: null, error: new Error('Missing saved call chat message ID'),
  }));
  const networkFailure = createCallMessageSender<Message>(async () => {
    throw new Error('offline');
  });
  assert((await noId.send('keep my draft')).status === 'failed',
    'missing saved ID falsely confirmed a message');
  assert((await networkFailure.send('keep my draft')).status === 'failed',
    'network failure falsely confirmed a message');
});
