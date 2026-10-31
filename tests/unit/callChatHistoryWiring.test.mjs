import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../../src/VideoCall.tsx', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../supabase/migrations/20260723064616_002_core_schema.sql', import.meta.url), 'utf8');

test('reconnected calls query the most recent 30 messages for that match only', () => {
  assert.match(call, /const CALL_CHAT_HISTORY_LIMIT = 30/);
  assert.match(call, /import \{ mergeStreamChatHistory \} from '\.\/utils\/mergeStreamChatHistory'/);
  const start = call.indexOf('const fetchRecentMessages = async () => {');
  const end = call.indexOf('    const channel = supabase.channel(', start);
  assert.ok(start >= 0 && end > start, 'call chat history loader missing');
  const history = call.slice(start, end);
  assert.match(history, /\.from\('messages'\)/);
  assert.match(history, /\.select\('id, sender_id, message, created_at'\)/);
  assert.match(history, /\.eq\('match_id', matchId\)/,
    'chat history must be scoped to the active call');
  assert.match(history, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(history, /\.limit\(CALL_CHAT_HISTORY_LIMIT\)/);
  assert.match(history, /if \(disposed\) return/);
  assert.match(history, /setMessages\(current => mergeStreamChatHistory\(\s*data\.slice\(\)\.reverse\(\), current, CALL_CHAT_HISTORY_LIMIT/);
  assert.doesNotMatch(history, /setMessages\(data\)/,
    'late history responses must not overwrite new chat messages');
});

test('history is loaded after Realtime subscription to avoid snapshot/subscribe gaps', () => {
  const section = call.slice(call.indexOf('const fetchRecentMessages = async () => {'),
    call.indexOf('    void checkEnded();', call.indexOf('const fetchRecentMessages = async () => {')));
  assert.match(section, /\.subscribe\(status => \{\s*if \(status === 'SUBSCRIBED' && !disposed\) void fetchRecentMessages\(\)/);
  assert.match(section, /event: 'INSERT', schema: 'public', table: 'messages'/);
  assert.match(section, /filter: `match_id=eq\.\$\{matchId\}`/);
  assert.match(section, /if \(disposed\) return;\s*const incoming = payload\.new/);
  assert.match(section, /setMessages\(prev => mergeStreamChatHistory\(\[incoming\], prev, CALL_CHAT_HISTORY_LIMIT\)\)/);
  assert.match(call, /clearInterval\(poll\);\s*void supabase\.removeChannel\(channel\)/);
});

test('existing database policy protects message history by match participants', () => {
  assert.match(core, /CREATE POLICY "messages read match participant" ON messages FOR SELECT TO authenticated/);
  assert.match(core, /m\.id = match_id AND \(m\.user1 = auth\.uid\(\) OR m\.user2 = auth\.uid\(\)\)/);
  assert.match(core, /created_at TIMESTAMPTZ DEFAULT NOW\(\)/);
});
