import { useState, useEffect, memo, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import { Users, Heart, Tv, Search, RefreshCw, Radio } from 'lucide-react';
import ViewerLiveRoom from './ViewerLiveRoom';
import {
  streamFromRow, applyLiveStreamChange, filterAndSortLiveStreams, LIVE_DISCOVERY_LIMIT,
  type LiveDiscoveryItem, type LiveDiscoveryEvent,
} from '../utils/liveDiscovery.mjs';

// A card preserves its identity when unrelated live streams change.
const StreamCard = memo(({ stream, onClick }: { stream: LiveDiscoveryItem; onClick: () => void }) => {
  const formatCount = (count: number) => count >= 1000 ? (count / 1000).toFixed(1) + 'K' : String(count);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`شاهد بث ${stream.title} مع ${stream.streamer_name}`}
      className="relative block aspect-[9/16] w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-[#0a0a16] border border-[#1a1a2e] group cursor-pointer transition-all duration-300 hover:border-[#00d4ff]/50 focus-visible:outline-2 focus-visible:outline-[#00d4ff] shadow-xl active:scale-[0.98] text-right"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center transition-transform duration-500 group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${stream.color}15, #05050c)` }}>
        {stream.avatar_url ? (
          <img src={stream.avatar_url} alt="" loading="lazy" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 shadow-inner" style={{ borderColor: stream.color }} />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl font-bold bg-white/5 border border-white/10" style={{ color: stream.color }}>
            {stream.streamer_name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-rose-600 text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-full text-white flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.5)] tracking-wider">
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
      </div>
      <div className="absolute bottom-0 w-full p-3 sm:p-4 bg-gradient-to-t from-black via-black/85 to-transparent pt-14">
        <p className="text-rose-300 text-xs sm:text-sm font-bold truncate mb-1">{stream.title}</p>
        <p className="text-white text-sm sm:text-base font-black truncate">{stream.streamer_name}</p>
        <div className="flex justify-between items-center text-white/70 text-[10px] sm:text-xs mt-2 border-t border-white/10 pt-2">
          <span className="flex items-center gap-1 font-medium"><Users size={13} style={{ color: stream.color }} />{formatCount(stream.viewers_count)} مشاهد</span>
          <span className="flex items-center gap-1 text-pink-400 font-bold"><Heart size={13} />{formatCount(stream.likes_count)}</span>
        </div>
      </div>
    </button>
  );
});

export default function LiveStreamGrid() {
  const [streams, setStreams] = useState<LiveDiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const [activeStream, setActiveStream] = useState<LiveDiscoveryItem | null>(null);
  const [myUserId, setMyUserId] = useState('');
  const [myUsername, setMyUsername] = useState('متابع');

  // Realtime updates received during an HTTP history request must not be
  // overwritten by a stale database response. Keep only a bounded event log.
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const eventVersionRef = useRef(0);
  const recentEventsRef = useRef<Array<{ version: number; event: LiveDiscoveryEvent }>>([]);

  const refreshStreams = useCallback(async (silent = false) => {
    const request = ++requestRef.current;
    const versionAtStart = eventVersionRef.current;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.from('live_streams')
        .select('*').eq('is_live', true)
        .order('created_at', { ascending: false }).limit(LIVE_DISCOVERY_LIMIT);
      if (error) throw error;
      if (!mountedRef.current || request !== requestRef.current) return;
      const fresh = (data || []).map(row => streamFromRow(row));
      const laterEvents = recentEventsRef.current.filter(e => e.version > versionAtStart);
      const reconciled = laterEvents.reduce((items, entry) => applyLiveStreamChange(items, entry.event), fresh);
      setStreams(reconciled);
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current || request !== requestRef.current) return;
      console.error('تعذر تحميل البثوث المباشرة:', error);
      setLoadError('تعذر تحديث البثوث. تحقق من اتصال الإنترنت وجرّب مجددًا.');
    } finally {
      if (mountedRef.current && request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data?.user) {
        setMyUserId(data.user.id);
        setMyUsername(data.user.user_metadata?.username || data.user.email?.split('@')[0] || 'متابع');
      } else {
        setMyUserId('guest_' + Math.random().toString(36).substring(2, 9));
      }
    }).catch(() => { /* Public discovery still works without a signed-in user. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStreams();

    const channel = supabase.channel('live_streams_discovery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, payload => {
        const event: LiveDiscoveryEvent = {
          eventType: payload.eventType as LiveDiscoveryEvent['eventType'],
          new: 'new' in payload ? payload.new : undefined,
          old: 'old' in payload ? payload.old : undefined,
        };
        eventVersionRef.current += 1;
        recentEventsRef.current.push({ version: eventVersionRef.current, event });
        if (recentEventsRef.current.length > 200) recentEventsRef.current.splice(0, 100);
        setStreams(current => applyLiveStreamChange(current, event));
      })
      .subscribe(status => {
        // Backfill launches/ends missed during offline or WebSocket reconnect.
        if (status === 'SUBSCRIBED') void refreshStreams(true);
      });

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [refreshStreams]);

  const visibleStreams = useMemo(
    () => filterAndSortLiveStreams(streams, search, sort),
    [streams, search, sort],
  );

  if (activeStream) {
    return (
      <ViewerLiveRoom
        streamId={activeStream.id}
        title={activeStream.title}
        streamerName={activeStream.streamer_name}
        streamerId={activeStream.user_id}
        myUserId={myUserId}
        myUsername={myUsername}
        onExit={() => setActiveStream(null)}
      />
    );
  }

  return (
    <section className="w-full max-w-full overflow-x-hidden" dir="rtl" aria-label="اكتشاف البثوث المباشرة">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-cyan-400 text-xs font-bold tracking-wider mb-1">SNOR LIVE · DISCOVER</p>
          <h2 className="text-white text-xl sm:text-2xl font-black flex items-center gap-2"><Radio size={21} className="text-rose-500" /> اكتشف البث المباشر</h2>
          <p className="text-white/50 text-xs sm:text-sm mt-1">تفرّج، اتفاعل، واكتشف مذيعين جدد</p>
        </div>
        <button type="button" onClick={() => void refreshStreams()} disabled={loading} title="تحديث البثوث" aria-label="تحديث البثوث" className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="دوّر على بث أو اسم مذيع..."
          aria-label="البحث في البثوث المباشرة"
          className="w-full bg-[#11111d] text-white placeholder:text-white/35 border border-white/10 focus:border-cyan-400/60 focus:outline-none rounded-2xl py-3 pr-12 pl-4 text-sm"
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { id: 'popular', label: '🔥 الأكثر مشاهدة' },
          { id: 'recent', label: '🆕 الأحدث' },
        ] as const).map(item => (
          <button key={item.id} type="button" onClick={() => setSort(item.id)} aria-pressed={sort === item.id}
            className={`rounded-full px-4 py-2 text-sm font-bold border transition-colors ${sort === item.id ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-300' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}>
            {item.label}
          </button>
        ))}
        <span role="status" className="mr-auto text-white/45 text-xs">{visibleStreams.length} بث متاح</span>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap justify-between gap-3 items-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
          <span>{loadError}</span>
          <button type="button" onClick={() => void refreshStreams()} className="underline font-bold">إعادة المحاولة</button>
        </div>
      )}

      {loading && streams.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4" aria-label="جاري تحميل البثوث">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="aspect-[9/16] w-full rounded-2xl bg-[#11111d] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : visibleStreams.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-14 text-center bg-white/5 rounded-3xl border border-white/10">
          <Tv size={38} className="text-white/30 mb-3" />
          <h3 className="text-white font-bold">{search.trim() ? 'مفيش بث مطابق للبحث' : 'مفيش بث مباشر دلوقتي'}</h3>
          <p className="text-white/50 text-sm mt-2">{search.trim() ? 'جرّب اسم مذيع أو عنوان تاني.' : 'كن أول شخص يبدأ بث مباشر!'}</p>
          {search.trim() && <button type="button" onClick={() => setSearch('')} className="text-cyan-300 underline text-sm mt-3">مسح البحث</button>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {visibleStreams.map(stream => (
            <StreamCard key={stream.id} stream={stream} onClick={() => setActiveStream(stream)} />
          ))}
        </div>
      )}
    </section>
  );
}
