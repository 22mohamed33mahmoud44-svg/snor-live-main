import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Video, VideoOff, Wand2,
  Radio, Type, Sparkles, Activity, Monitor, AlertTriangle, RefreshCw
} from 'lucide-react';

interface LiveStreamStudioProps {
  onClose: () => void;
  onStart: (title: string, filterId: string, intensity: number, stream: MediaStream | null) => void;
}

interface FilterType {
  id: string;
  name: string;
  icon: string;
  getEffect: (intensity: number) => string;
  unit: string;
  defaultVal: number;
  min: number;
  max: number;
}

type CameraStatus = 'idle' | 'loading' | 'ready' | 'error';

// 💡 تحسين: نقل قائمة الفلاتر خارج المكون لمنع إعادة إنشائها مع كل render
const filtersList: FilterType[] = [
  { id: 'natural', name: 'طبيعي Real', icon: '✨', getEffect: () => 'none', unit: '%', defaultVal: 0, min: 0, max: 0 },
  { id: 'beauty', name: 'نعومة الـ 4K', icon: '🧼', getEffect: (v) => `blur(${v * 0.012}px) brightness(${1 + v * 0.0006})`, unit: '%', defaultVal: 65, min: 0, max: 100 },
  { id: 'brightness', name: 'إضاءة سينمائية', icon: '💡', getEffect: (v) => `brightness(${1 + v * 0.0035})`, unit: '%', defaultVal: 50, min: 0, max: 100 },
  { id: 'blush', name: 'توريد البشرة', icon: '🌸', getEffect: (v) => `hue-rotate(${360 - v * 0.25}deg) saturate(${1 + v * 0.004})`, unit: '%', defaultVal: 40, min: 0, max: 100 },
  { id: 'contour', name: 'تحديد ملامح', icon: '🎭', getEffect: (v) => `contrast(${1 + v * 0.004})`, unit: '%', defaultVal: 50, min: 0, max: 100 },
  { id: 'teeth', name: 'ابتسامة ناصعة', icon: '😁', getEffect: (v) => `brightness(${1 + v * 0.0015}) contrast(${1 + v * 0.0015})`, unit: '%', defaultVal: 60, min: 0, max: 100 },
  { id: 'eyes', name: 'حدة البؤرة', icon: '👁️', getEffect: (v) => `contrast(${1 + v * 0.004})`, unit: '%', defaultVal: 50, min: 0, max: 100 },
  { id: 'cinematic', name: 'دافئ كلاسيك', icon: '🍿', getEffect: (v) => `sepia(${v * 0.0035})`, unit: '%', defaultVal: 55, min: 0, max: 100 },
  { id: 'cyberpunk', name: 'فوشيا نيون', icon: '👾', getEffect: (v) => `hue-rotate(${300 + v * 0.4}deg)`, unit: '%', defaultVal: 50, min: 0, max: 100 },
  { id: 'vintage', name: 'أفلام قديمة', icon: '📜', getEffect: (v) => `grayscale(${v * 0.007})`, unit: '%', defaultVal: 40, min: 0, max: 100 },
  { id: 'clear', name: 'نقاء كريستال', icon: '💎', getEffect: (v) => `contrast(${1 + v * 0.005})`, unit: '%', defaultVal: 50, min: 0, max: 100 },
  { id: 'mystic', name: 'سحر الغموض', icon: '🔮', getEffect: (v) => `hue-rotate(${v * 0.7}deg)`, unit: '%', defaultVal: 45, min: 0, max: 100 },
];

export default function LiveStreamStudio({ onClose, onStart }: LiveStreamStudioProps) {
  const [streamTitle, setStreamTitle] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [openFiltersPanel, setOpenFiltersPanel] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('beauty');
  const [filterIntensity, setFilterIntensity] = useState(65);
  const [isMobile, setIsMobile] = useState(false);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<{ width: number; height: number; frameRate: number } | null>(null);

  const intensityMapRef = useRef<Record<string, number>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // تشغيل الكاميرا بدقة رأسية متوافقة 100% مع أجهزة الموبايل والبث الجوال
  const initCamera = useCallback(async () => {
    setCameraStatus('loading');
    setCameraError('');

    // إيقاف أي Track قديم شغال قبل إعادة التهيئة لمنع قفل الهاردوير للعدسة
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          // التعديل: طلب أبعاد رأسية حقيقية (1080x1920) بدلاً من الأبعاد العريضة لمنع تشويه الوجه
          width: { ideal: 1080 }, 
          height: { ideal: 1920 },
          aspectRatio: { ideal: 0.5625 } // أبعاد 9:16 الدقيقة
        },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        setVideoInfo({
          width: settings.width ?? 0,
          height: settings.height ?? 0,
          frameRate: Math.round(settings.frameRate ?? 0),
        });
      }

      setCameraStatus('ready');
    } catch (err) {
      console.error('🔮 Camera System Error:', err);
      setCameraStatus('error');

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setCameraError('تم رفض إذن الوصول للكاميرا أو الميكروفون. من فضلك فعّل الصلاحية من إعدادات المتصفح وحاول مرة أخرى.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setCameraError('لم يتم العثور على كاميرا أو ميكروفون متصل بالجهاز.');
      } else {
        setCameraError('حدث خطأ غير متوقع أثناء تشغيل الكاميرا. حاول مرة أخرى.');
      }
    }
  }, []);

  useEffect(() => {
    initCamera();

    return () => {
      if (!handedOffRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initCamera]);

  const toggleMic = () => {
    if (!streamRef.current) return;
    const nextMuted = !isMicMuted;
    streamRef.current.getAudioTracks().forEach(t => (t.enabled = !nextMuted));
    setIsMicMuted(nextMuted);
  };

  const toggleCamera = () => {
    if (!streamRef.current) return;
    const nextOff = !isCamOff;
    streamRef.current.getVideoTracks().forEach(t => (t.enabled = !nextOff));
    setIsCamOff(nextOff);
  };

  const handleFilterChange = (id: string) => {
    intensityMapRef.current[selectedFilter] = filterIntensity;
    setSelectedFilter(id);
    const target = filtersList.find(f => f.id === id);
    const savedIntensity = intensityMapRef.current[id];
    setFilterIntensity(savedIntensity !== undefined ? savedIntensity : (target?.defaultVal ?? 0));
  };

  const handleIntensityChange = (value: number) => {
    setFilterIntensity(value);
    intensityMapRef.current[selectedFilter] = value;
  };

  const handleStart = () => {
    handedOffRef.current = true;
    onStart(streamTitle || 'بث مباشر جديد', selectedFilter, filterIntensity, streamRef.current);
  };

  const handleClose = () => {
    handedOffRef.current = false;
    onClose();
  };

  const activeFilterObj = filtersList.find(f => f.id === selectedFilter) || filtersList[0];
  const computedFilterStyle = activeFilterObj.getEffect(filterIntensity);

  const CameraErrorOverlay = () => (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 rounded-2xl">
      <div className="max-w-sm w-full bg-[#11111f] border border-white/10 rounded-2xl p-6 space-y-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <h3 className="font-bold text-sm">تعذّر تشغيل الكاميرا</h3>
        <p className="text-xs text-white/50 leading-relaxed">{cameraError}</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={initCamera}
          className="w-full py-2.5 bg-rose-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          إعادة المحاولة
        </motion.button>
        <button onClick={handleClose} className="text-xs text-white/40 hover:text-white/70 transition-colors">
          إلغاء والخروج
        </button>
      </div>
    </div>
  );

  // ==========================================
  // 📱 1. واجهة الموبايل الثورية (كادر صافي 100% غامق بالكامل)
  // ==========================================
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black text-white z-[9999] flex flex-col justify-between overflow-hidden select-none font-['Cairo']" dir="rtl">
        <div className="absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1] transition-all duration-300"
            style={{ filter: computedFilterStyle }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 pointer-events-none" />
          {cameraStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {cameraStatus === 'error' && <CameraErrorOverlay />}
        </div>

        <header className="relative z-10 flex justify-between items-center p-4 mt-[env(safe-area-inset-top)]">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/90"
          >
            <X className="w-5 h-5" />
          </motion.button>

          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-xs font-bold tracking-wide text-rose-400">STUDIO LIVE</span>
          </div>
        </header>

        <footer className="relative z-10 p-4 space-y-4 mb-[env(safe-area-inset-bottom)]">
          <div className="relative">
            <Type className="absolute right-4 top-3.5 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={streamTitle}
              onChange={e => setStreamTitle(e.target.value)}
              placeholder="اكتب عنواناً للبث يلفت الأنظار... 🔥"
              maxLength={80}
              className="w-full bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl py-3 pr-10 pl-4 text-sm text-white placeholder-white/40 outline-none focus:border-rose-500/50 transition-colors text-center font-medium"
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleMic}
                disabled={cameraStatus !== 'ready'}
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all disabled:opacity-40 ${isMicMuted ? 'bg-red-500/80 border-red-500' : 'bg-black/40 border-white/10 backdrop-blur-md'}`}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleCamera}
                disabled={cameraStatus !== 'ready'}
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all disabled:opacity-40 ${isCamOff ? 'bg-red-500/80 border-red-500' : 'bg-black/40 border-white/10 backdrop-blur-md'}`}
              >
                {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </motion.button>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setOpenFiltersPanel(true)}
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center border-2 border-white shadow-lg shadow-purple-500/30"
            >
              <Wand2 className="w-5 h-5 text-white" />
            </motion.button>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            disabled={cameraStatus !== 'ready'}
            className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-2xl font-black text-sm tracking-wide shadow-lg shadow-rose-500/20 disabled:opacity-40"
          >
            بدء البث المباشر الآن 🚀
          </motion.button>
        </footer>

        <AnimatePresence>
          {openFiltersPanel && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 bg-[#0c0c14]/95 border-t border-white/5 rounded-t-[2rem] p-6 z-50 backdrop-blur-2xl space-y-5"
            >
              <div className="flex justify-between items-center text-xs font-bold text-white/50">
                <span className="text-white flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> {activeFilterObj.name}</span>
                <input
                  type="range"
                  min="0" max="100"
                  value={filterIntensity}
                  onChange={e => handleIntensityChange(Number(e.target.value))}
                  disabled={activeFilterObj.max === 0}
                  className="flex-1 mx-4 accent-purple-500 h-1 bg-white/10 rounded-full appearance-none disabled:opacity-30"
                />
                <span className="text-purple-400 font-mono">{filterIntensity}%</span>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x">
                {filtersList.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFilterChange(f.id)}
                    className={`flex-shrink-0 flex flex-col items-center gap-2 snap-center transition-all ${selectedFilter === f.id ? 'text-purple-400' : 'text-white/40'}`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold border transition-all ${selectedFilter === f.id ? 'bg-purple-500/20 border-purple-500 shadow-md shadow-purple-500/10' : 'bg-white/5 border-white/5'}`}>
                      {f.icon}
                    </div>
                    <span className="text-[10px] font-bold">{f.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================
  // 🖥️ 2. واجهة الديسكتوب والكمبيوتر الاحترافية (محاكاة كادر الموبايل 9:16 بالمنتصف)
  // ==========================================
  return (
    <div className="fixed inset-0 bg-[#07070c] text-white z-[9999] flex overflow-hidden font-['Cairo'] select-none" dir="rtl">

      {/* الجانب الأيمن: الفلاتر */}
      <aside className="w-80 bg-[#0b0b13] border-l border-white/[0.04] flex flex-col p-5 space-y-6 flex-shrink-0">
        <div className="flex items-center gap-2 pb-4 border-b border-white/[0.05]">
          <Wand2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-black tracking-wide">مركز تجميل الفلاتر الذكي</h2>
        </div>

        <div className="bg-[#11111f] p-4 rounded-2xl border border-white/[0.02] space-y-3">
          <div className="flex justify-between text-xs font-bold text-indigo-400">
            <span>قوة تأثير {activeFilterObj.name}</span>
            <span className="font-mono">{filterIntensity}%</span>
          </div>
          <input
            type="range"
            min="0" max="100"
            value={filterIntensity}
            onChange={e => handleIntensityChange(Number(e.target.value))}
            disabled={activeFilterObj.max === 0}
            className="w-full accent-indigo-500 bg-white/5 rounded-full h-1 appearance-none cursor-pointer disabled:opacity-30"
          />
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-1 scrollbar-none">
          {filtersList.map(f => {
            const isSelected = selectedFilter === f.id;
            return (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all ${isSelected ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-[#11111f] border-transparent text-white/60 hover:text-white'}`}
              >
                <span className="text-2xl">{f.icon}</span>
                <span className="text-xs font-bold tracking-tight text-center">{f.name}</span>
              </motion.button>
            );
          })}
        </div>
      </aside>

      {/* المنتصف: التعديل الجوهري - عزل الفيديو بداخل حاوية طولية محاكية للموبايل 9:16 بارتفاع كامل */}
      <main className="flex-1 relative bg-[#020205] flex items-center justify-center p-4">
        <div className="relative aspect-[9/16] h-full max-h-[92vh] rounded-3xl overflow-hidden bg-black shadow-2xl border border-white/5">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1] transition-all duration-300"
            style={{ filter: computedFilterStyle }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

          {cameraStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {cameraStatus === 'error' && <CameraErrorOverlay />}

          {/* هيدر معلومات الإشارة عائم فوق شاشة الكاميرا المصغرة */}
          <div className="absolute top-4 inset-x-4 flex justify-between items-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-auto">
              <Activity className={`w-3.5 h-3.5 ${cameraStatus === 'ready' ? 'text-emerald-400 animate-pulse' : 'text-white/30'}`} />
              <span className="text-[11px] font-medium text-white/80">
                {cameraStatus === 'ready' && videoInfo
                  ? <><span className="text-emerald-400 font-mono font-bold">{videoInfo.width}×{videoInfo.height}</span></>
                  : 'غير متاح'}
              </span>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center pointer-events-auto text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* أزرار العتاد السفلية بداخل كادر الكاميرا */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleMic}
              disabled={cameraStatus !== 'ready'}
              className={`w-10 h-10 rounded-full flex items-center justify-center border text-white shadow-xl transition-all disabled:opacity-40 ${isMicMuted ? 'bg-red-500 border-red-600' : 'bg-black/60 border-white/10 backdrop-blur-md'}`}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleCamera}
              disabled={cameraStatus !== 'ready'}
              className={`w-10 h-10 rounded-full flex items-center justify-center border text-white shadow-xl transition-all disabled:opacity-40 ${isCamOff ? 'bg-red-500 border-red-600' : 'bg-black/60 border-white/10 backdrop-blur-md'}`}
            >
              {isCamOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>
      </main>

      {/* الجانب الأيسر: إعداد ونشر الغرفة */}
      <aside className="w-72 bg-[#0b0b13] border-r border-white/[0.04] flex flex-col p-6 justify-between flex-shrink-0">
        <div className="space-y-5">
          <div className="flex items-center gap-2 pb-4 border-b border-white/[0.05]">
            <Monitor className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-black tracking-wide">إعدادات ونشر الغرفة</h2>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white/40 flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> عنوان الغرفة وإشعار المتابعين</label>
            <textarea
              value={streamTitle}
              onChange={e => setStreamTitle(e.target.value)}
              placeholder="اكتب هنا عنواناً جذاباً ومثيراً لغرفة البث الخاصة بك... 🔥"
              maxLength={120}
              className="w-full h-32 bg-[#11111f] border border-white/5 rounded-2xl p-4 text-sm text-white placeholder-white/20 outline-none focus:border-rose-500/40 transition-colors resize-none font-medium"
            />
            <p className="text-[10px] text-white/30 text-left">{streamTitle.length}/120</p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStart}
          disabled={cameraStatus !== 'ready'}
          className="w-full py-4 bg-gradient-to-r from-rose-500 via-pink-500 to-purple-600 rounded-2xl font-black text-sm tracking-wide shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition-all text-white disabled:opacity-40"
        >
          نشر وإطلاق البث الآن 🚀
        </motion.button>
      </aside>

    </div>
  );
}