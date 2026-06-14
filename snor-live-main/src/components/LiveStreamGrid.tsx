import { useState, useEffect } from 'react';
import { supabase } from '../supabase'; 
import { Users, Heart, Tv } from 'lucide-react';
import ViewerLiveRoom from './ViewerLiveRoom'; // 🆕 استيراد غرفة المشاهد

interface StreamItem {
  id: string; // ده ID البث في جدول live_streams
  user_id: string; // ده ID المذيع
  title: string;
  streamer_name: string;
  color: string;
  viewers: string;
  avatar_url?: string;
}

export default function LiveStreamGrid() {
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // 🆕 ستيت لحفظ البث اللي المشاهد ضغط عليه وعايز يدخله
  const [activeStream, setActiveStream] = useState<StreamItem | null>(null);

  // بيانات افتراضية للمشاهد الحالي (تتغير تلقائياً حسب الـ Auth لاحقاً)
  const myUserId = "viewer_" + Math.random().toString(36).substring(2, 9);
  const myUsername = "متابع سنور";

  useEffect(() => {
    // 1. دالة جلب البثوث النشطة الحقيقية من السيرفر
    const fetchLiveStreams = async () => {
      try {
        setLoading(true);
        // بنسحب البثوث اللي شغال دلوقتي بس
        const { data, error } = await supabase
          .from('live_streams')
          .select('*')
          .eq('is_live', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const colors = ['#7c3aed', '#00d4ff', '#f472b6', '#34d399', '#fb923c'];
          
          // تحويل البيانات الحقيقية من السيرفر وعرضها
          const mappedStreams = data.map((stream, i) => ({
            id: stream.id,
            user_id: stream.user_id,
            title: stream.title,
            streamer_name: stream.streamer_name || 'مذيع نشط',
            viewers: `${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 9)}K`, // محاكاة للمشاهدين لتجميل التصميم
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

    // 2. تفعيل الـ Realtime عشان أي بث جديد يظهر فوراً بدون Refresh
    const channel = supabase
      .channel('live_streams_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
        fetchLiveStreams();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 🆕 3. لو المشاهد دخل بث فعلاً، اقطع الـ Grid واعرض غرفة المشاهد فوراً
  if (activeStream) {
    return (
      <ViewerLiveRoom 
        streamId={activeStream.id}
        title={activeStream.title}
        streamerName={activeStream.streamer_name}
        myUserId={myUserId}
        myUsername={myUsername}
        onExit={() => setActiveStream(null)} // يرجعه للرئيسية عند الضغط على ✕
      />
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="animate-pulse aspect-[9/16] rounded-2xl bg-[#0a0a16] border border-[#1a1a2e]/50" />
        ))}
      </div>
    );
  }

  // لو مفيش أي بث شغال حالياً
  if (streams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-white/5 rounded-2xl border border-white/10 mt-4">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <Tv className="w-8 h-8 text-white/30" />
        </div>
        <h4 className="text-white font-bold mb-1">لا يوجد بثوث مباشرة الآن</h4>
        <p className="text-white/40 text-sm">كُن أول من يبدأ البث المباشر!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {streams.map((stream) => (
        /* 🆕 4. ربط حدث الـ onClick لفتح الغرفة عند الضغط على الكارت */
        <div 
          key={stream.id} 
          onClick={() => setActiveStream(stream)}
          className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-[#0a0a16] border border-[#1a1a2e] group cursor-pointer transition-all duration-300 hover:border-[#00d4ff]/40 hover:-translate-y-1 shadow-lg"
        >
          
          {/* الخلفية الملونة للبث */}
          <div className="absolute inset-0 flex flex-col items-center justify-center transition-transform duration-500 group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${stream.color}15, #05050c)` }}>
            {stream.avatar_url ? (
              <img src={stream.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: stream.color }} />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold bg-white/5 border border-white/10" style={{ color: stream.color }}>
                {stream.streamer_name[0].toUpperCase()}
              </div>
            )}
          </div>
          
          {/* شارة البث المباشر (LIVE) */}
          <div className="absolute top-3 right-3 bg-red-500 text-[10px] font-bold px-2.5 py-1 rounded-md text-white flex items-center gap-1.5 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
          </div>
          
          {/* تفاصيل البث السفلية */}
          <div className="absolute bottom-0 w-full p-3 bg-gradient-to-t from-black via-black/80 to-transparent pt-10">
            {/* عنوان البث الحقيقي */}
            <p className="text-white text-xs font-bold truncate mb-1 text-rose-300">{stream.title}</p>
            {/* اسم المذيع الحقيقي */}
            <p className="text-white/90 text-sm font-bold truncate">{stream.streamer_name}</p>
            
            <div className="flex justify-between items-center text-white/50 text-[10px] mt-2 border-t border-white/10 pt-2">
              <span className="flex items-center gap-1"><Users size={10} style={{ color: stream.color }} /> {stream.viewers}</span>
              <span className="flex items-center gap-1 hover:text-pink-400 transition-colors"><Heart size={10} /> Like</span>
            </div>
          </div>

        </div>
      ))}
    </div>
  );
}