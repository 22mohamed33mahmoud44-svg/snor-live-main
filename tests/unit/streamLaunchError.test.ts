/// <reference lib="deno.ns" />
import {
  isDuplicateActiveStreamError,
  streamLaunchErrorMessage,
} from '../../src/utils/streamLaunchError.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('named PostgreSQL unique violation tells streamer about another active session', () => {
  const error = { code: '23505', message: 'duplicate key value violates unique constraint "uq_live_streams_one_active_per_user"' };
  assert(isDuplicateActiveStreamError(error), 'expected single-active-index violation');
  assert(streamLaunchErrorMessage(error).includes('بث مباشر شغال بالفعل'), 'wrong Arabic error');
});

Deno.test('other unique violations and PostgreSQL codes are not misclassified', () => {
  for (const error of [
    { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' },
    { code: '23503', message: 'uq_live_streams_one_active_per_user' },
    { code: '42501', details: 'permission denied' },
    { code: '23514', message: 'Existing duplicate active streams' },
    null,
  ]) {
    assert(!isDuplicateActiveStreamError(error), 'misclassified unrelated database failure');
    assert(streamLaunchErrorMessage(error).includes('حاول مرة أخرى'), 'generic error should prompt retry');
  }
});

Deno.test('PostgREST details also identify the exact violated index', () => {
  assert(isDuplicateActiveStreamError({ code: '23505', details: 'uq_live_streams_one_active_per_user' }),
    'constraint may appear in details');
});
