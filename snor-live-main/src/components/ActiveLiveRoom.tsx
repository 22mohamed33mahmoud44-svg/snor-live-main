import { useState, useRef, useEffect } from 'react';

interface ActiveLiveRoomProps {
  title: string;
  filterId: string;
  onEndStream: () => void;
}

interface ChatMessage {
  id: number;
  user: string;
  text: string;
  color: string;
}

export default function ActiveLiveRoom({ title, filterId, onEndStream }: ActiveLiveRoomProps) {
  const [viewers, setViewers] = useState(1);
  const [uptime, setUptime] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // نفس قائمة الفلاتر البسيطة عشان نجيب تأثير الفلتر اللي المذيع اختاره
  const filtersList = [
    { id: 'natural', effect: 'none' },
    { id: 'beauty', effect: 'blur(0.4px) brightness(1.02) contrast(0.98)' },
    { id: 'brightness', effect: 'brightness(1.15)' },
    { id: 'blush', effect: 'hue-rotate(350deg) saturate(1.2)' },
    { id: 'cinema', effect: 'sepia(0.2) contrast(1.05)' },
    { id: 'cyberpunk', effect: 'hue-rotate(300deg) saturate(1.25)' },
  ];
  const activeFilterEffect = filtersList.find(f => f.id === filterId)?.effect || 'none';

  // تشغيل الكاميرا فور الدخول للغرفة الحية
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, 
      audio: true 
    }).then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(err => console.error("الكاميرا غير متاحة:", err));

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // عداد وقت البث ومحاكاة دخول المشاهدين
  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(prev => prev + 1);
      setViewers(prev => Math.max(1, prev + Math.floor(Math.random() * 5) - 2));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // محاكاة رسائل الشات التلقائية لدخول المتابعين
  useEffect(() => {
    const fakeUsers = ['أحمد', 'سارة', 'Mido', 'Nour', 'عاشق الليل'];
    const fakeMsgs = ['منور يا غالي 🔥', 'البث بيقطع ولا عندي بس؟', 'أحلى مسا عليك', 'كمل إحنا معاك', '❤️❤️❤️'];
    const colors = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#c084fc'];

    const chatInterval = setInterval(() => {
      if (Math.random() > 0.4) {
        const newMsg: ChatMessage = {
          id: Date.now(),
          user: fakeUsers[Math.floor(Math.random() * fakeUsers.length)],
          text: fakeMsgs[Math.floor(Math.random() * fakeMsgs.length)],
          color: colors[Math.floor(Math.random() * colors.length)]
        };
        setChatMessages(prev => [...prev.slice(-15), newMsg]);
      }
    }, 3000);
    return () => clearInterval(chatInterval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const myMsg: ChatMessage = { id: Date.now(), user: 'المذيع (أنت)', text: chatInput, color: '#ff2a74' };
    setChatMessages(prev => [...prev.slice(-15), myMsg]);
    setChatInput('');
  };

  const handleEndStream = () => {
    if (window.confirm('هل أنت متأكد أنك تريد إنهاء البث المباشر؟')) {
      onEndStream();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', direction: 'rtl', fontFamily: "'Cairo', sans-serif", overflow: 'hidden' }}>
      
      {/* خلفية البث المباشر (الكاميرا) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilterEffect, transform: 'scaleX(-1)' }} />
        {/* تدرج لوني خفيف فوق الكاميرا عشان النصوص والشات يبانوا بوضوح */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 20%, transparent 60%, rgba(0,0,0,0.8) 100%)' }} />
      </div>

      {/* الواجهة العائمة فوق البث */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' }}>
        
        {/* الهيدر العلوي */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 'max(8px, env(safe-area-inset-top))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '50px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ff2a74', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: '#fff' }}>أنت</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{title}</span>
              <span style={{ fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>LIVE {formatTime(uptime)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '6px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              👁️ {viewers}
            </div>
            <button onClick={handleEndStream} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.8)', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* منطقة الشات والتحكم السفلي */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: '4px', WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to bottom, transparent, black 20%)', WebkitMaskImage: '-webkit-linear-gradient(top, transparent, black 20%)' }}>
            <div style={{ flex: 1 }} />
            {chatMessages.map(msg => (
              <div key={msg.id} style={{ display: 'inline-block', background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '14px', maxWidth: '85%', alignSelf: 'flex-start', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: msg.color, fontSize: '0.75rem', fontWeight: 800, marginLeft: '6px' }}>{msg.user}:</span>
                <span style={{ color: '#fff', fontSize: '0.8rem' }}>{msg.text}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="تحدث مع المتابعين..." style={{ flex: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px', padding: '12px 16px', color: '#fff', fontSize: '0.85rem', outline: 'none', backdropFilter: 'blur(10px)' }} />
            <button type="submit" style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #3b82f6)', border: 'none', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>💬</button>
          </form>
        </div>
      </div>
    </div>
  );
}