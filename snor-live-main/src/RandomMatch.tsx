import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { startMatching, cancelMatching } from './match';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  userId: string;
  onClose: () => void;
  onMatch: (match: any) => void;
};

type Phase = 'idle' | 'waiting' | 'matched';

export default function RandomMatch({ userId, onClose, onMatch }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dots, setDots] = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dotsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchedRef = useRef(false);

  // 🔊 مراجع الصوت (استخدمنا روابط موثوقة لضمان عملها فوراً)
  const radarAudioRef = useRef<HTMLAudioElement | null>(null);
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  // تهيئة الأصوات عند فتح المكون
  useEffect(() => {
    radarAudioRef.current = new Audio('https://actions.google.com/sounds/v1/science_fiction/sonar_ping.ogg');
    radarAudioRef.current.loop = true; // تكرار صوت الرادار
    radarAudioRef.current.volume = 0.4;

    successAudioRef.current = new Audio('https://actions.google.com/sounds/v1/state_of_mind/success_bell.ogg');
    successAudioRef.current.volume = 0.8;

    return () => {
      // 🧹 تنظيف الذاكرة وإيقاف الصوت عند إغلاق الشاشة
      radarAudioRef.current?.pause();
      successAudioRef.current?.pause();
      radarAudioRef.current = null;
      successAudioRef.current = null;
    };
  }, []);

  // نقاط التحميل أثناء الانتظار
  useEffect(() => {
    if (phase === 'waiting') {
      dotsTimer.current = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 500);
    } else {
      if (dotsTimer.current) clearInterval(dotsTimer.current);
      setDots('');
    }
    return () => { if (dotsTimer.current) clearInterval(dotsTimer.current); };
  }, [phase]);

  // حماية من تعليق النظام لو المستخدم قفل التطبيق فجأة
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (phase === 'waiting') cancelMatching(userId);
    };
  }, [userId, phase]);

  const handleMatchFound = useCallback((match: any) => {
    if (matchedRef.current) return;
    matchedRef.current = true;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // 🔊 تبديل الصوت من الرادار إلى النجاح
    radarAudioRef.current?.pause();
    if (radarAudioRef.current) radarAudioRef.current.currentTime = 0;
    successAudioRef.current?.play().catch(() => {}); // catch لمنع أخطاء المتصفح

    setPhase('matched');
    setTimeout(() => onMatch(match), 1800); // إعطاء وقت للمستخدم لرؤية الأنميشن
  }, [onMatch]);

  // ── Start matching ───────────────────────────────────────────
  const handleStart = async () => {
    matchedRef.current = false;
    setPhase('waiting');
    
    // 🔊 تشغيل صوت الرادار
    radarAudioRef.current?.play().catch(() => {});

    try {
      const result = await startMatching(userId);

      if (result.status === 'matched' && result.match) {
        handleMatchFound(result.match);
        return;
      }

      // الاشتراك السريع في القناة لسماع أي تحديثات فورية
      const onInsert = (payload: { new: Record<string, unknown> }) => {
        const m = payload.new as { id: string; user1: string; user2: string };
        handleMatchFound(m);
      };

      const channel = supabase
        .channel('my-match-' + userId + '-' + Date.now())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `user1=eq.${userId}` }, onInsert)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `user2=eq.${userId}` }, onInsert)
        .subscribe();

      channelRef.current = channel;

    } catch (err) {
      console.error('startMatching error:', err);
      radarAudioRef.current?.pause();
      setPhase('idle');
    }
  };

  // ── Cancel while waiting ─────────────────────────────────────
  const handleCancel = async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    // 🔊 إيقاف الصوت
    radarAudioRef.current?.pause();
    if (radarAudioRef.current) radarAudioRef.current.currentTime = 0;

    await cancelMatching(userId);
    setPhase('idle');
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={s.overlay}
    >
      <style>{CSS}</style>

      {phase === 'idle' && (
        <button style={s.closeBtn} onClick={onClose} aria-label="إغلاق">✕</button>
      )}

      {/* الرادار المتحرك */}
      {phase === 'waiting' && (
        <div style={s.ringsWrap}>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="rm-ring"
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
              style={{ width: 150, height: 150 }}
            />
          ))}
        </div>
      )}

      {/* الأفاتار المتحرك */}
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: phase === 'matched' ? [1, 1.2, 1] : 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className={phase === 'matched' ? 'rm-avatar rm-avatar--matched' : 'rm-avatar'}
        >
          {phase === 'idle'    && '🎲'}
          {phase === 'waiting' && '🔍'}
          {phase === 'matched' && '🎉'}
        </motion.div>
      </AnimatePresence>

      <h2 style={s.title}>
        {phase === 'idle'    && 'مطابقة عشوائية'}
        {phase === 'waiting' && `جاري البحث${dots}`}
        {phase === 'matched' && 'تم العثور على شريك!'}
      </h2>

      <p style={s.sub}>
        {phase === 'idle'    && 'اضغط ابدأ وهنوصّلك بشخص عشوائي على فيديو كول فوراً'}
        {phase === 'waiting' && 'بندور على شخص ليك… استنى لحظة'}
        {phase === 'matched' && 'بيتم الاتصال الآن… استعد!'}
      </p>

      {/* أزرار التحكم */}
      {phase === 'idle' && (
        <motion.button 
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          style={s.btnPrimary} onClick={handleStart}
        >
          ابدأ المطابقة الآن
        </motion.button>
      )}
      
      {phase === 'waiting' && (
        <motion.button 
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          style={s.btnGhost} onClick={handleCancel}
        >
          إلغاء البحث
        </motion.button>
      )}
    </motion.div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 900,
    background: 'rgba(6,6,14,0.97)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Cairo', sans-serif", direction: 'rtl',
    backdropFilter: 'blur(12px)',
    WebkitTapHighlightColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute', top: 'max(1.5rem, env(safe-area-inset-top))', left: '1.5rem',
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '1.2rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation',
  },
  ringsWrap: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: {
    color: '#fff', fontSize: '1.65rem', fontWeight: 900,
    margin: '0 0 .5rem', textAlign: 'center', minWidth: 220, zIndex: 10,
  },
  sub: {
    color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem',
    margin: '0 0 2.5rem', textAlign: 'center',
    maxWidth: 280, lineHeight: 1.6, zIndex: 10, fontWeight: 600,
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
    border: 'none', borderRadius: 50, padding: '1rem 3.5rem',
    color: '#fff', fontSize: '1.1rem', fontWeight: 800,
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
    boxShadow: '0 8px 28px rgba(124,58,237,0.4)',
    zIndex: 10, touchAction: 'manipulation',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 50, padding: '1rem 3.5rem',
    color: 'rgba(255,255,255,0.8)', fontSize: '1rem', fontWeight: 800,
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
    zIndex: 10, touchAction: 'manipulation',
  },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  
  .rm-ring {
    position: absolute; border-radius: 50%;
    border: 2px solid rgba(0, 212, 255, 0.4);
    background: radial-gradient(circle, rgba(0,212,255,0.1) 0%, transparent 70%);
  }
  
  .rm-avatar {
    width: 120px; height: 120px; border-radius: 50%;
    background: linear-gradient(135deg, #2a2a35 0%, #1a1a24 100%);
    border: 2px solid rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 3.5rem; margin-bottom: 2rem;
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
    z-index: 10;
  }
  
  .rm-avatar--matched {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: #34d399;
    box-shadow: 0 0 80px rgba(16, 185, 129, 0.6);
  }
`;