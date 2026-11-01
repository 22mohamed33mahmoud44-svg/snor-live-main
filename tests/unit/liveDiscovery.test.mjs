import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyLiveStreamChange, streamFromRow, filterAndSortLiveStreams } from '../../src/utils/liveDiscovery.mjs';

const row = (id, more = {}) => ({
  id, user_id: 'owner_' + id, title: 'دردشة مسائية', streamer_name: 'محمد',
  viewers_count: 3, likes_count: 1, is_live: true,
  created_at: '2026-11-01T20:00:00Z', ...more,
});

test('discovery searches broadcaster name and title, including Arabic hamza differences', () => {
  const items = [row('a', { streamer_name: 'أحمد', title: 'ألعاب' }), row('b', { streamer_name: 'مريم', title: 'موسيقى' })].map(x => streamFromRow(x));
  assert.deepEqual(filterAndSortLiveStreams(items, 'احمد').map(x => x.id), ['a']);
  assert.deepEqual(filterAndSortLiveStreams(items, 'العاب').map(x => x.id), ['a']);
  assert.deepEqual(filterAndSortLiveStreams(items, '  مريم  ').map(x => x.id), ['b']);
  assert.equal(filterAndSortLiveStreams(items, 'غير موجود').length, 0);
});

test('popular and latest ranking are independent and do not mutate original feed', () => {
  const items = [
    streamFromRow(row('a', { viewers_count: 2, created_at: '2026-11-01T12:00:00Z' })),
    streamFromRow(row('b', { viewers_count: 20, created_at: '2026-11-01T11:00:00Z' })),
    streamFromRow(row('c', { viewers_count: 5, created_at: '2026-11-01T13:00:00Z' })),
  ];
  assert.deepEqual(filterAndSortLiveStreams(items, '', 'popular').map(x => x.id), ['b','c','a']);
  assert.deepEqual(filterAndSortLiveStreams(items, '', 'recent').map(x => x.id), ['c','a','b']);
  assert.deepEqual(items.map(x => x.id), ['a','b','c']);
});

test('Realtime INSERT and inactive-to-active UPDATE show new streams; closed and deleted broadcasts disappear', () => {
  const initial = [streamFromRow(row('old'))];
  const added = applyLiveStreamChange(initial, { eventType: 'INSERT', new: row('new') });
  assert.deepEqual(added.map(x => x.id), ['new', 'old']);
  assert.deepEqual(initial.map(x => x.id), ['old'], 'do not mutate existing state');
  const opened = applyLiveStreamChange(added, { eventType: 'UPDATE', new: row('restart') });
  assert.ok(opened.some(x => x.id === 'restart'));
  const closed = applyLiveStreamChange(opened, { eventType: 'UPDATE', new: row('old', {is_live:false}) });
  assert.ok(!closed.some(x => x.id === 'old'));
  const deleted = applyLiveStreamChange(closed, { eventType: 'DELETE', old: { id: 'new' } });
  assert.ok(!deleted.some(x => x.id === 'new'));
});

test('Realtime update reconciles existing row, preserves creator id, and prevents duplicates', () => {
  const initial = [streamFromRow(row('a'))];
  const changed = applyLiveStreamChange(initial, {eventType:'UPDATE', new:row('a',{viewers_count:99,title:'الحفلة بدأت'})});
  assert.equal(changed.length, 1);
  assert.equal(changed[0].viewers_count, 99);
  assert.equal(changed[0].title, 'الحفلة بدأت');
  assert.equal(changed[0].user_id, 'owner_a');
});

test('events received during a slow snapshot can be replayed without reviving ended streams', () => {
  const snapshot = [streamFromRow(row('expired')), streamFromRow(row('alive'))];
  const events = [
    {eventType:'UPDATE',new:row('expired',{is_live:false})},
    {eventType:'INSERT',new:row('new')},
  ];
  const reconciled = events.reduce((state, event) => applyLiveStreamChange(state,event),snapshot);
  assert.deepEqual(reconciled.map(x=>x.id),['new','alive']);
});

test('interface has accessible real controls and forwards the creator id for follow/gifts', () => {
  const home = readFileSync(new URL('../../src/Dashboard.tsx',import.meta.url),'utf8');
  const grid = readFileSync(new URL('../../src/components/LiveStreamGrid.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(home,/label: '🎥 كاميرا HD'|label: '🌍 دولي'/);
  assert.match(grid,/filterAndSortLiveStreams\(streams, search, sort\)/);
  assert.match(grid,/streamerId=\{activeStream\.user_id\}/);
  assert.match(grid,/aria-label="البحث في البثوث المباشرة"/);
  assert.match(grid,/aria-pressed=\{sort === item\.id\}/);
  assert.match(grid,/aria-label=\{`شاهد بث/);
  assert.match(grid,/\.subscribe\(status =>/);
  assert.match(grid,/if \(status === 'SUBSCRIBED'\) void refreshStreams\(true\)/);
  assert.match(grid,/recentEventsRef\.current\.filter\(e => e\.version > versionAtStart\)/);
});
