/// <reference lib="deno.ns" />
import { createIdempotentCallChatWriter } from '../../src/utils/idempotentCallChatWriter.ts';
import {
  CALL_CHAT_ATTEMPT_TTL_MS,
  createSessionCallChatAttemptStore,
  type CallChatAttemptStorage,
} from '../../src/utils/sessionCallChatAttemptStore.ts';

function assert(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}

function makeStorage(): CallChatAttemptStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
    removeItem(key) { entries.delete(key); },
  };
}
type Row = { id: string; message: string };
const savedRow = (id: string, message: string): Row => ({ id, message });

Deno.test('same-tab refresh reuses pending UUID after DB commit loses its acknowledgement', async () => {
  const session = makeStorage();
  const db = new Map<string, Row>();
  let generated = 0;
  const idsInserted: string[] = [];
  let networkOnline = false;

  const insert = async (id: string, message: string) => {
    idsInserted.push(id);
    if (!db.has(id)) db.set(id, savedRow(id, message));
    if (!networkOnline) throw new Error('write committed, acknowledgement lost');
    return { data: null, error: null }; // conflict ignored
  };
  const find = async (id: string) => networkOnline
    ? { data: db.get(id) ?? null, error: null }
    : { data: null, error: new Error('connection unavailable') };
  const makeWriter = () => createIdempotentCallChatWriter<Row>(
    () => `uuid-${++generated}`, insert, find,
    createSessionCallChatAttemptStore(session, 'call:match:sender'),
  );
  const first = makeWriter();
  assert((await first.persist('رسالة غير مؤكدة')).error !== null, 'lost response falsely confirmed');
  assert(db.size === 1, 'initial write did not commit');
  const persisted = session.entries.get('call:match:sender') ?? '';
  assert(persisted.includes('uuid-1') && !persisted.includes('رسالة غير مؤكدة'),
    'pending ID was not stored or private message text leaked into sessionStorage');

  // Simulate component teardown followed by browser refresh in the same tab.
  networkOnline = true;
  const recreated = makeWriter();
  const retried = await recreated.persist('رسالة غير مؤكدة');
  assert(retried.error === null && retried.data?.id === 'uuid-1',
    'fresh writer did not recover the original server ID');
  assert(idsInserted.join(',') === 'uuid-1,uuid-1' && db.size === 1,
    'same-tab reload duplicated the persisted chat message');
  assert(generated === 1, 'retry generated a new UUID after refresh');
  assert(!session.entries.has('call:match:sender'), 'confirmed send left stale retry metadata');
});

Deno.test('different draft after refresh never reuses previous message ID', async () => {
  const session = makeStorage();
  const store = createSessionCallChatAttemptStore(session, 'match:user');
  await store.save('old-id', 'original draft');
  assert(await store.load('original draft') === 'old-id', 'matching original draft was not recognized');
  assert(await store.load('changed draft') === null, 'changed text reused an unrelated UUID');
  await store.save('new-id', 'changed draft');
  assert(await store.load('changed draft') === 'new-id', 'new message ID was not persisted');
  store.clear('old-id');
  assert(await store.load('changed draft') === 'new-id',
    'late callback from old UI erased the new draft attempt');
  store.clear('new-id');
  assert(await store.load('changed draft') === null, 'successful send did not clear metadata');
});

Deno.test('old pending UUID expires, malformed records are removed, and distinct users are isolated', async () => {
  const session = makeStorage();
  let time = 100_000;
  const a = createSessionCallChatAttemptStore(session, 'match:alice', () => time);
  const b = createSessionCallChatAttemptStore(session, 'match:bob', () => time);
  await a.save('a-id', 'same message');
  await b.save('b-id', 'same message');
  assert(await a.load('same message') === 'a-id' && await b.load('same message') === 'b-id',
    'different senders did not get independent UUIDs');
  time += CALL_CHAT_ATTEMPT_TTL_MS + 1;
  assert(await a.load('same message') === null, 'expired retry ID survived TTL');
  assert(!session.entries.has('match:alice'), 'expired metadata was not removed');
  session.setItem('match:alice', '{not json');
  assert(await a.load('same message') === null && !session.entries.has('match:alice'),
    'corrupt session storage was not ignored and cleaned');
});

Deno.test('blocked storage does not interrupt confirmed sends or in-memory retry', async () => {
  const inaccessible: CallChatAttemptStorage = {
    getItem() { throw Error('SecurityError'); },
    setItem() { throw Error('QuotaExceededError'); },
    removeItem() { throw Error('SecurityError'); },
  };
  const store = createSessionCallChatAttemptStore(inaccessible, 'blocked');
  let ids = 0;
  let calls = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++ids}`,
    async (id, message) => {
      calls++;
      return calls === 1
        ? { data: null, error: new Error('offline') }
        : { data: savedRow(id, message), error: null };
    },
    async () => ({ data: null, error: new Error('offline') }),
    store,
  );
  assert((await writer.persist('not lost')).error !== null, 'offline write incorrectly confirmed');
  assert((await writer.persist('not lost')).data?.id === 'uuid-1', 'blocked session storage broke retry');
  assert(ids === 1, 'in-memory fallback did not preserve UUID');
});

Deno.test('normal repeated text after a confirmed send always creates a distinct UUID', async () => {
  const session = makeStorage();
  let count = 0;
  const writer = createIdempotentCallChatWriter<Row>(
    () => `uuid-${++count}`,
    async (id, message) => ({ data: savedRow(id, message), error: null }),
    async () => ({ data: null, error: null }),
    createSessionCallChatAttemptStore(session, 'repeat'),
  );
  const one = await writer.persist('hello');
  const two = await writer.persist('hello');
  assert(one.data?.id === 'uuid-1' && two.data?.id === 'uuid-2',
    'intentional second send reused the acknowledged ID');
  assert(!session.entries.has('repeat'), 'confirmed send metadata was retained');
});
