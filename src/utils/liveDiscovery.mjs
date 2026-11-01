// Pure, browser-independent live-discovery logic. No database writes.
const COLORS = ['#7c3aed', '#00d4ff', '#f472b6', '#34d399', '#fb923c'];
const MAX_STREAMS = 50;

export function streamFromRow(row, previous = null) {
  const id = typeof row?.id === 'string' ? row.id : '';
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return {
    id,
    user_id: typeof row?.user_id === 'string' ? row.user_id : (previous?.user_id ?? ''),
    title: typeof row?.title === 'string' ? row.title : (previous?.title ?? 'بث مباشر'),
    streamer_name: typeof row?.streamer_name === 'string' && row.streamer_name.trim()
      ? row.streamer_name : (previous?.streamer_name ?? 'مذيع نشط'),
    viewers_count: Math.max(0, Number.isFinite(Number(row?.viewers_count)) ? Number(row.viewers_count) : (previous?.viewers_count ?? 0)),
    likes_count: Math.max(0, Number.isFinite(Number(row?.likes_count)) ? Number(row.likes_count) : (previous?.likes_count ?? 0)),
    color: previous?.color ?? COLORS[Math.abs(hash) % COLORS.length],
    avatar_url: row?.thumbnail_url || previous?.avatar_url || undefined,
    created_at: row?.created_at || previous?.created_at || '',
  };
}

export function applyLiveStreamChange(streams, event) {
  const row = event?.new ?? null;
  const id = row?.id ?? event?.old?.id;
  if (!id || typeof id !== 'string') return streams;
  const others = streams.filter(s => s.id !== id);
  if (event.eventType === 'DELETE' || row?.is_live === false) return others;
  if (event.eventType !== 'INSERT' && event.eventType !== 'UPDATE') return streams;
  if (row?.is_live !== true) return streams;

  const existing = streams.find(s => s.id === id);
  return [streamFromRow(row, existing), ...others].slice(0, MAX_STREAMS);
}

function normalizeSearch(text) {
  return String(text ?? '').normalize('NFKC')
    .toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').trim();
}

export function filterAndSortLiveStreams(streams, search, sort = 'popular') {
  const needle = normalizeSearch(search);
  const found = needle ? streams.filter(s =>
    normalizeSearch(s.title).includes(needle) ||
    normalizeSearch(s.streamer_name).includes(needle)
  ) : streams;
  return [...found].sort((a, b) => {
    const viewers = b.viewers_count - a.viewers_count;
    const newest = String(b.created_at).localeCompare(String(a.created_at));
    const likes = b.likes_count - a.likes_count;
    return (sort === 'recent' ? newest || viewers : viewers || likes || newest) ||
      a.id.localeCompare(b.id);
  });
}

export const LIVE_DISCOVERY_LIMIT = MAX_STREAMS;
