import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../../src/components/ViewerLiveRoom/index.tsx', import.meta.url), 'utf8');
const broadcaster = readFileSync(new URL('../../src/components/ActiveLiveRoom.tsx', import.meta.url), 'utf8');

const cases = [
  ['viewer', viewer, 'setMessages'],
  ['broadcaster', broadcaster, 'setChatMessages'],
];

for (const [name, source, setMessages] of cases) {
  test(`${name}: subscribe before fetching latest stream chat history`, () => {
    const effectStart = source.indexOf(name === 'viewer'
      ? '// إدارة قنوات الشات والـ Realtime'
      : '// ── دورة حياة البث + Realtime ──');
    const effectEnd = source.indexOf(name === 'viewer'
      ? '  // Periodic batches are single-flight.'
      : '  useEffect(() => {\n    if (!giftToast)', effectStart);
    assert.ok(effectStart >= 0 && effectEnd > effectStart, 'stream chat effect not found');
    const effect = source.slice(effectStart, effectEnd);

    assert.match(effect, /const fetchOldMessages = async \(\) => \{/);
    assert.match(effect, /\.from\('stream_chat'\)/);
    assert.match(effect, /\.eq\('stream_id', streamId\)/);
    assert.match(effect, /\.order\('created_at', \{ ascending: false \}\)\s*\.limit\(MESSAGES_LIMIT\)/);
    assert.equal((effect.match(/\bfetchOldMessages\(\)/g) ?? []).length, 1,
      'chat history must not be requested before the channel subscribes');
    const callback = effect.slice(effect.indexOf('.subscribe((status) => {'));
    assert.match(callback, /if \(status === 'SUBSCRIBED' && isMounted\) \{/);
    assert.match(callback, /void fetchOldMessages\(\)/);
    assert.ok(callback.indexOf('void fetchOldMessages()') > callback.indexOf("status === 'SUBSCRIBED'"),
      'history started before realtime subscription was established');
    assert.match(effect, new RegExp(setMessages + String.raw`\(current => mergeStreamChatHistory\(recentHistory, current, MESSAGES_LIMIT\)\)`));
    assert.match(effect, /isMounted = false/,
      'history responses after leaving the room must be ignored');
  });
}

test('viewer and broadcaster backfill after every SUBSCRIBED callback including reconnections', () => {
  for (const source of [viewer, broadcaster]) {
    const subscribed = source.slice(source.indexOf(".on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat'"));
    assert.match(subscribed, /\.subscribe\(\(status\) => \{\s*if \(status === 'SUBSCRIBED' && isMounted\)/);
    assert.doesNotMatch(subscribed.slice(0, subscribed.indexOf('.subscribe((status) => {')),
      /fetchOldMessages\(\)/, 'history query started before Realtime subscription');
  }
});
