import  { useState, useEffect, memo, useCallback } from 'react';
import { supabase } from '../supabase'; 
import { Users, Heart, Tv } from 'lucide-react';
import ViewerLiveRoom from './ViewerLiveRoom'; 

interface StreamItem {
  id: string; 
  user_id: string; 
  title: string;
  streamer_name: string;
  color: string;
  viewers_count: number; 
  likes_count: number;   
  avatar_url?: string;
}

// ── 1. عزل بطاقة البث لمنع إعادة رسم الشبكة بالكامل ───────────────────────────
const StreamCard = memo(({ stream, onClick }: { stream: StreamItem, onClick: () => void }) => {
  const formatCount = (count: number) => {
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  };

  return (
    <div 
      onClick={onClick}
      className="relative aspect-[9/16] w-full rounded-3xl overflow-hidden bg-[#0a0a16] border border-[#1a1a2e] group cursor-pointer transition-all duration-300 hover:border-[#00d4ff]/40 shadow-xl active:scale-[0.98]"
    >
      {/* الخلفية والأفاتار */}
      <div className="absolute inset-0 flex flex-col items-center justify-center transition-transform duration-500 group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${stream.color}15, #05050c)` }}>
        {stream.avatar_url ? (
          <img 
            src={stream.avatar_url} 
            alt="" 
            loading="lazy" // 🚀 تحميل كسول: لا يتم تحميل الصورة إلا عندما تظهر على الشاشة لتوفير الباقة
            className="w-20 h-20 rounded-full object-cover border-2 shadow-inner" 
            style={{ borderColor: stream.color }} 
          />
        ) : (
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold bg-white/5 border border-white/10" style={{ color: stream.color }}>
            {stream.streamer_name[0].toUpperCase()}
          </div>
        )}
      </div>
      
      {/* شارة اللايف */}
      <div className="absolute top-4 right-4 bg-red-500 text-[11px] font-black px-3 py-1 rounded-full text-white flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.6)] tracking-wider">
        <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="w-1.5 h-1.5 bg-white rounded-full absolute" /> LIVE
      </div>
      
      {/* تفاصيل البث الأسفل */}
      <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-black via-black/85 to-transparent pt-14">
        <p className="text-white text-sm font-bold truncate mb-1 text-rose-300">{stream.title}</p>
        <p className="text-white/90 text-base font-black truncate">{stream.streamer_name}</p>
        
        {/* إحصائيات البث */}
        <div className="flex justify-between items-center text-white/60 text-xs mt-3 border-t border-white/10 pt-2.5">
          <span className="flex items-center gap-1.5 font-medium">
            <Users size={12} style={{ color: stream.color }} /> 
            {formatCount(stream.viewers_count)} من المتابعين
          </span>
          <span className="flex items-center gap-1.5 text-pink-400 font-bold">
            <Heart size={12} className="fill-pink-500/20" /> 
            {formatCount(stream.likes_count)}
          </span>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 🛡️ درع الأداء: البطاقة ستُحدث نفسها فقط إذا تغيرت الأرقام الخاصة بها تحديداً
  return (
    prevProps.stream.viewers_count === nextProps.stream.viewers_count &&
    prevProps.stream.likes_count === nextProps.stream.likes_count &&
    prevProps.stream.title === nextProps.stream.title &&
    prevProps.stream.avatar_url === nextProps.stream.avatar_url
  );
});

// ── 2. المكون الرئيسي ────────────────────────────────────────────────────────
export default function LiveStreamGrid() {
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeStream, setActiveStream] = useState<StreamItem | null>(null);

  const [myUserId, setMyUserId] = useState<string>("");
  const [myUsername, setMyUsername] = useState<string>("متابع نشط");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setMyUserId(data.user.id);
        setMyUsername(data.user.user_metadata?.username || data.user.email?.split('@')[0] || "متابع");
      } else {
        setMyUserId("guest_" + Math.random().toString(36).substring(2, 9));
      }
    });
  }, []);

  useEffect(() => {
    const colors = ['#7c3aed', '#00d4ff', '#f472b6', '#34d399', '#fb923c'];

    const fetchLiveStreams = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('live_streams')
          .select('*')
          .eq('is_live', true)
          .order('created_at', { ascending: false })
          .limit(30); // 🚀 حماية السيرفر: جلب 30 بث فقط في البداية

        if (error) throw error;

        if (data) {
          const mappedStreams = data.map((stream, i) => ({
            id: stream.id,
            user_id: stream.user_id,
            title: stream.title,
            streamer_name: stream.streamer_name || 'مذيع نشط',
            viewers_count: stream.viewers_count || 0, 
            likes_count: stream.likes_count || 0,     
            color: colors[i % colors.length],
            avatar_url: stream.thumbnail_url 
          }));
          
          setStreams(mappedStreams);
        }
      } catch (err) {
        console.error("خطأ في تحميل البثوث المباشرة:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveStreams();

    const channel = supabase
      .channel('live_streams_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, (payload) => {
        switch (payload.eventType) {
          case 'INSERT':
            if (payload.new.is_live) {
              const newStream: StreamItem = {
                id: payload.new.id, user_id: payload.new.user_id, title: payload.new.title,
                streamer_name: payload.new.streamer_name || 'مذيع نشط',
                viewers_count: payload.new.viewers_count || 0, likes_count: payload.new.likes_count || 0,
                color: colors[Math.floor(Math.random() * colors.length)], avatar_url: payload.new.thumbnail_url
              };
              setStreams(prev => [newStream, ...prev].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
            }
            break;
          case 'UPDATE':
            if (payload.new.is_live === false) {
              setStreams(prev => prev.filter(s => s.id !== payload.new.id));
            } else {
              setStreams(prev => prev.map(s => s.id === payload.new.id ? { ...s, title: payload.new.title, viewers_count: payload.new.viewers_count, likes_count: payload.new.likes_count, avatar_url: payload.new.thumbnail_url || s.avatar_url } : s));
            }
            break;
          case 'DELETE':
            setStreams(prev => prev.filter(s => s.id !== payload.old.id));
            break;
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // استخدام useCallback لمنع إعادة إنشاء الدالة مع كل تصيير
  const handleStreamClick = useCallback((stream: StreamItem) => {
    setActiveStream(stream);
  }, []);

  if (activeStream) {
    return (
      <ViewerLiveRoom 
        streamId={activeStream.id}
        title={activeStream.title}
        streamerName={activeStream.streamer_name}
        myUserId={myUserId}
        myUsername={myUsername}
        onExit={() => setActiveStream(null)} 
      />
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-4 p-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="animate-pulse aspect-[9/16] rounded-3xl bg-[#0a0a16] border border-[#1a1a2e]/50" />
        ))}
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-white/5 rounded-3xl border border-white/10 mx-2 mt-4">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <Tv className="w-8 h-8 text-white/30" />
        </div>
        <h4 className="text-white font-bold mb-1">لا يوجد بثوث مباشرة الآن</h4>
        <p className="text-white/40 text-sm">كُن أول من يبدأ البث المباشر!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-5 p-2 max-w-full overflow-x-hidden">
      {streams.map((stream) => (
        <StreamCard 
          key={stream.id} 
          stream={stream} 
          onClick={() => handleStreamClick(stream)} 
        />
      ))}
    </div>
  );
}