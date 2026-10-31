/// <reference lib="deno.ns" />
import { createCallMessageSender } from '../../src/utils/callMessageSender.ts';
import { createIdempotentCallChatWriter, CALL_CHAT_SEND_TIMEOUT_MS } from '../../src/utils/idempotentCallChatWriter.ts';

function assert(value: unknown, description: string) {
  if (!value) throw new Error(description);
}
type ChatRow = { id: string; message: string };
const row = (id: string, message: string): ChatRow => ({ id, message });

Deno.test('unresponsive committed insert times out and retry uses the same UUID', async () => {
  const db = new Map<string, ChatRow>();
  let resolveLate!: (value: { data: ChatRow; error: null }) => void;
  const hung = new Promise<{ data: ChatRow; error: null }>(resolve => { resolveLate = resolve; });
  const attempted: string[] = [];
  let ids = 0;
  let aborts = 0;
  const writer = createIdempotentCallChatWriter<ChatRow>(
    () => `uuid-${++ids}`,
    async (id, text, signal) => {
      attempted.push(id);
      if (!db.has(id)) db.set(id, row(id, text));
      if (attempted.length === 1) {
        signal.addEventListener('abort', () => { aborts++; }, { once: true });
        return hung; // server committed; browser never gets response
      }
      return { data: null, error: null }; // same UUID, ON CONFLICT DO NOTHING
    },
    async id => ({ data: db.get(id) ?? null, error: null }),
    undefined,
    15,
  );
  const sender = createCallMessageSender<ChatRow>(message => writer.persist(message));
  const first = sender.send('  hello  ');
  assert(sender.isSending(), 'initial send should lock immediately');
  assert((await sender.send('hello')).status === 'busy', 'duplicate tap bypassed in-flight lock');
  const failed = await first;
  assert(failed.status === 'failed' && !sender.isSending(),
    'deadline did not release the send lock or preserve failed status');
  assert(aborts === 1 && db.size === 1, 'hung write was not aborted or did not commit');
  const retry = await sender.send('hello');
  assert(retry.status === 'sent' && retry.data?.id === 'uuid-1',
    'retry did not recover committed row with original ID');
  assert(ids === 1 && attempted.join(',') === 'uuid-1,uuid-1' && db.size === 1,
    'timeout caused a second database message with a new ID');
  resolveLate({ data: row('uuid-1', 'hello'), error: null });
  await Promise.resolve();
  await Promise.resolve();
  const next = await sender.send('hello');
  assert(next.status === 'sent' && next.data?.id === 'uuid-2',
    'late aborted confirmation corrupted state of a new intentional send');
});

Deno.test('hung recovery SELECT also times out without permanently locking composer', async () => {
  let calls = 0;
  let recoveryAborts = 0;
  let created = 0;
  const writer = createIdempotentCallChatWriter<ChatRow>(
    () => `uuid-${++created}`,
    async () => ({ data: null, error: new Error('lost write acknowledgement') }),
    async (id, signal) => {
      calls++;
      if (calls === 1) {
        signal.addEventListener('abort', () => { recoveryAborts++; }, { once: true });
        return new Promise<null>(() => {}); // fetch ignores abort
      }
      return { data: row(id, 'hello'), error: null };
    },
    undefined,
    12,
  );
  const sender = createCallMessageSender<ChatRow>(text => writer.persist(text));
  assert((await sender.send('hello')).status === 'failed',
    'hanging recovery read did not return an unconfirmed outcome');
  assert(!sender.isSending() && recoveryAborts === 1,
    'recovery hang did not release composer or abort fetch');
  const retried = await sender.send('hello');
  assert(retried.status === 'sent' && retried.data?.id === 'uuid-1' && created === 1,
    'recovery retry generated a duplicate message ID');
});

Deno.test('late aborted confirmation cannot clear a newer pending draft', async () => {
  let finishOld!: (value: { data: ChatRow; error: null }) => void;
  const late = new Promise<{ data: ChatRow; error: null }>(resolve => { finishOld = resolve; });
  let ids = 0;
  const writer = createIdempotentCallChatWriter<ChatRow>(
    () => `uuid-${++ids}`,
    async (id, text) => text === 'old' ? late : ({ data: null, error: { code: 'offline' } }),
    async () => ({ data: null, error: new Error('offline') }),
    undefined,
    12,
  );
  const old = await writer.persist('old');
  assert(old.error !== null, 'unresponsive old request was accidentally accepted');
  const next = await writer.persist('new');
  assert(next.error !== null && ids === 2, 'new draft did not get a separate ID');
  finishOld({ data: row('uuid-1', 'old'), error: null });
  await Promise.resolve();
  const retryNew = await writer.persist('new');
  assert(retryNew.error !== null && ids === 2,
    'late response cleared or rewrote the newer pending attempt');
});

Deno.test('fast confirmed messages cancel timeout and remain independently sendable', async () => {
  assert(CALL_CHAT_SEND_TIMEOUT_MS === 20_000, 'unexpected call chat deadline');
  let ids = 0;
  let unexpectedAborts = 0;
  const writer = createIdempotentCallChatWriter<ChatRow>(
    () => `uuid-${++ids}`,
    async (id, message, signal) => {
      signal.addEventListener('abort', () => { unexpectedAborts++; }, { once: true });
      return { data: row(id, message), error: null };
    },
    async () => { throw Error('recovery not needed'); },
    undefined,
    15,
  );
  const first = await writer.persist('same');
  const second = await writer.persist('same');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(first.data?.id === 'uuid-1' && second.data?.id === 'uuid-2',
    'confirmed sends were incorrectly de-duplicated');
  assert(unexpectedAborts === 0, 'completed attempts left their timeout timers active');
});
