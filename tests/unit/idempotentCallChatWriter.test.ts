/// <reference lib="deno.ns" />
import { createIdempotentCallChatWriter } from '../../src/utils/idempotentCallChatWriter.ts';
import { createCallMessageSender } from '../../src/utils/callMessageSender.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
type Row = { id: string; message: string; sender_id: string; created_at: string };
const row = (id: string, message: string): Row => ({
  id, message, sender_id: 'caller-1', created_at: '2026-10-31T12:00:00Z',
});

Deno.test('lost confirmation after DB commit never inserts a duplicate on retry', async () => {
  const database = new Map<string, Row>();
  const writes: string[] = [];
  let attempts = 0;
  let online = false;
  let idsCreated = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++idsCreated}`,
    async (id, message) => {
      writes.push(id);
      if (!database.has(id)) database.set(id, row(id, message));
      attempts++;
      if (attempts === 1) throw new Error('response lost after COMMIT');
      return { data: null, error: null }; // ON CONFLICT DO NOTHING
    },
    async id => online ? { data: database.get(id) ?? null, error: null }
      : { data: null, error: new Error('also offline while recovering') },
  );
  const sender = createCallMessageSender<Row>(text => writer.persist(text));

  assert((await sender.send('  hello  ')).status === 'failed',
    'ambiguous write must not clear the chat composer');
  assert(database.size === 1 && writes.length === 1, 'initial write not committed');
  online = true;
  const retried = await sender.send('hello');
  assert(retried.status === 'sent' && retried.data?.id === 'uuid-1',
    'retry did not recover the original persisted row');
  assert(database.size === 1 && writes.join(',') === 'uuid-1,uuid-1',
    'retry generated a different ID and duplicated the chat');
  assert(idsCreated === 1, 'same draft retry generated a new UUID');
});

Deno.test('a lost write response can be recovered immediately by a scoped SELECT', async () => {
  const writer = createIdempotentCallChatWriter<Row>(
    () => 'uuid-one',
    async () => { throw new Error('network error after commit'); },
    async id => ({ data: row(id, 'sent'), error: null }),
  );
  const sent = await writer.persist('sent');
  assert(sent.error === null && sent.data?.id === 'uuid-one',
    'authoritative saved row should resolve uncertain write immediately');
});

Deno.test('a newly sent message gets a fresh ID, even when its text is identical', async () => {
  let serial = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++serial}`,
    async (id, message) => ({ data: row(id, message), error: null }),
    async () => { throw Error('unnecessary recovery'); },
  );
  const first = await writer.persist('hi');
  const second = await writer.persist('hi');
  assert(first.data?.id !== second.data?.id && serial === 2,
    'intentional second send was mistakenly deduplicated');
});

Deno.test('changing the draft after a failure creates a new UUID', async () => {
  const ids: string[] = [];
  let serial = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++serial}`,
    async (id) => { ids.push(id); return { data: null, error: new Error('offline') }; },
    async () => ({ data: null, error: null }),
  );
  assert((await writer.persist('old draft')).error !== null, 'failed request misreported as sent');
  assert((await writer.persist('new draft')).error !== null, 'failed request misreported as sent');
  assert(ids.join(',') === 'uuid-1,uuid-2',
    'changed message content must not recycle an unrelated ID');
});

Deno.test('recovery cannot confirm a different message, wrong UUID or hidden row', async () => {
  for (const existing of [
    row('uuid-original', 'different text'),
    row('uuid-other', 'same text'),
    null,
  ]) {
    const writer = createIdempotentCallChatWriter<Row>(
      () => 'uuid-original',
      async () => ({ data: null, error: { code: '42501' } }),
      async () => ({ data: existing, error: null }),
    );
    const result = await writer.persist('same text');
    assert(result.error !== null && result.data === null,
      'unverified/unauthorized row was accepted as confirmation');
  }
});

Deno.test('repeated network failures keep original UUID and never falsely report success', async () => {
  const attempted: string[] = [];
  let serial = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++serial}`,
    async id => { attempted.push(id); throw new Error('offline'); },
    async () => { throw new Error('read offline'); },
  );
  for (let i = 0; i < 3; i++) {
    const outcome = await writer.persist('unsent');
    assert(outcome.data === null && outcome.error !== null,
      'unconfirmed offline write marked as delivered');
  }
  assert(serial === 1 && attempted.every(x => x === 'uuid-1'),
    'network retries generated new IDs');
});
