/// <reference lib="deno.ns" />
import { createCallMessageSender } from '../../src/utils/callMessageSender.ts';

function assert(condition: unknown, explanation: string) {
  if (!condition) throw new Error(explanation);
}

Deno.test('send trims nonempty messages and requires a successful server write', async () => {
  const writes: string[] = [];
  const sender = createCallMessageSender(async message => {
    writes.push(message);
    return { error: null };
  });
  const empty = await sender.send('   ');
  const sent = await sender.send('  السلام عليكم  ');
  assert(empty.status === 'empty' && writes.length === 1, 'empty messages must not write');
  assert(sent.status === 'sent' && sent.text === 'السلام عليكم', 'message must be trimmed');
  assert(writes[0] === 'السلام عليكم', 'wrong message persisted');
});

Deno.test('Supabase errors, rejected network requests and absent responses fail closed', async () => {
  const errorSender = createCallMessageSender(async () => ({ error: { message:'RLS denied' } }));
  assert((await errorSender.send('unsent')).status === 'failed', 'database error was ignored');
  const rejected = createCallMessageSender(async () => { throw new Error('offline'); });
  assert((await rejected.send('keep me')).status === 'failed', 'network error was ignored');
  const missing = createCallMessageSender(async () => undefined);
  assert((await missing.send('unknown result')).status === 'failed', 'missing result accepted');
  assert(!rejected.isSending(), 'sender did not unlock after error');
});

Deno.test('second click while the first insert is in flight must not resend', async () => {
  let resolveWrite: ((result: { error: null }) => void) | undefined;
  const gate = new Promise<{ error: null }>(resolve => { resolveWrite = resolve; });
  let writes = 0;
  const sender = createCallMessageSender(async () => {
    writes++;
    return gate;
  });
  const first = sender.send('  one ');
  assert(sender.isSending(), 'sender must lock synchronously');
  const second = await sender.send('one');
  assert(second.status === 'busy' && writes === 1, 'duplicate request was sent');
  if (!resolveWrite) throw new Error('gate not initialized');
  resolveWrite({ error: null });
  assert((await first).status === 'sent', 'first message was not acknowledged');
  assert(!sender.isSending(), 'sender did not unlock after success');
  assert((await sender.send('next')).status === 'sent' && writes === 2, 'sender did not recover');
});
