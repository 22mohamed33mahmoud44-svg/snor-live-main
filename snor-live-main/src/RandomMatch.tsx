import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { startMatching, cancelMatching, type Match } from './match';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  userId: string;
  onClose: () => void;
  onMatch: (match: Match) => void;
};

type Phase = 'idle' | 'waiting' | 'matched' | 'error';

// نطاق البحث عن مباراة حديثة (للفحص الاحتياطي) — دقيقتان
const RECENT_MATCH_WINDOW_MS = 2 * 60 * 1000;
// فاصل الفحص الاحتياطي الدوري أثناء الانتظار
const POLL_INTERVAL_MS = 4000;

export default function RandomMatch({ userId, onClose, onMatch }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dots, setDots] = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dotsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchedRef = useRef(false);
  const startingRef = useRef(false);
  // مرجع للمرحلة الحالية حتى يعمل تنظيف "عند الإغلاق فقط" بالقيمة الصحيحة
  // (سابقاً كان الـ effect يعتمد على [phase] فيعمل التنظيف عند كل تغيير مرحلة)
  const phaseRef = useRef<Phase>('idle');
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const setPhaseSafe = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // 🔊 مراجع الصوت
  const radarAudioRef = useRef<HTMLAudioElement | null>(null);
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    radarAudioRef.current = new Audio('https://actions.google.com/sounds/v1/science_fiction/sonar_ping.ogg');
    radarAudioRef.current.loop = true;
    radarAudioRef.current.volume = 0.4;

    successAudioRef.current = new Audio('https://actions.google.com/sounds/v1/state_of_mind/success_bell.ogg');
    successAudioRef.current.volume = 0.8;

    return () => {
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

  // 🧹 إيقاف كل موارد البحث (القناة + الفحص الدوري + صوت الرادار)
  const stopSearchResources = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    radarAudioRef.current?.pause();
    if (radarAudioRef.current) radarAudioRef.current.currentTime = 0;
  }, []);

  const handleMatchFound = useCallback((match: Match) => {
    // حارس ضد التكرار: قد يصل نفس الحدث من القناة اللحظية ومن الفحص الاحتياطي معاً
    if (matchedRef.current) return;
    matchedRef.current = true;

    stopSearchResources();
    successAudioRef.current?.play().catch(() => {});
    setPhaseSafe('matched');

    // ⏱️ مؤقت الاحتفال يُحفظ في مرجع ليُلغى عند إغلاق الشاشة
    // (سابقاً كان يشتغل حتى بعد فك المكون ويسحب المستخدم لمكالمة وهو خارجها)
    matchTimer.current = setTimeout(() => onMatch(match), 1800);
  }, [onMatch, setPhaseSafe, stopSearchResources]);

  // 🔍 فحص احتياطي: هل توجد مباراة نشطة حديثة أنا طرف فيها؟
  // يغطي حالة ضياع حدث INSERT (انقطاع websocket لحظي أو أي سباق آخر)
  const checkExistingMatch = useCallback(async () => {
    if (matchedRef.current) return;
    const cutoff = new Date(Date.now() - RECENT_MATCH_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from('matches')
      .select('id, user1, user2, status, created_at')
      .eq('status', 'active')
      .or(`user1.eq.${userId},user2.eq.${userId}`)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && !matchedRef.current) {
      handleMatchFound(data as Match);
    }
  }, [userId, handleMatchFound]);

  // ── Start matching ───────────────────────────────────────────
  const handleStart = async () => {
    // حارس ضد الضغط المتكرر على الزر
    if (startingRef.current || phaseRef.current === 'waiting') return;
    startingRef.current = true;

    matchedRef.current = false;
    setPhaseSafe('waiting');
    radarAudioRef.current?.play().catch(() => {});

    try {
      // 1️⃣ الاشتراك في القناة *أولاً* وانتظار تأكيد SUBSCRIBED
      //    قبل استدعاء الـ RPC — هذا يغلق نافذة السباق التي كانت
      //    تضيع فيها أحداث INSERT بين رد الـ RPC وتفعيل الاشتراك.
      const onInsert = (payload: { new: Record<string, unknown> }) => {
        handleMatchFound(payload.new as unknown as Match);
      };

      await new Promise<void>((resolve, reject) => {
        const channel = supabase
          .channel(`my-match-${userId}-${Date.now()}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `user1=eq.${userId}` }, onInsert)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `user2=eq.${userId}` }, onInsert)
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`channel ${status}`));
            // ملاحظة: لو حدث خطأ بالقناة لاحقاً أثناء الانتظار،
            // الفحص الدوري أدناه يستمر كشبكة أمان.
          });
        channelRef.current = channel;
      });

      // المستخدم ألغى أثناء الاشتراك؟
     if ((phaseRef.current as string) !== 'waiting') return;

      // 2️⃣ الآن فقط نستدعي الـ RPC الآمنة (transaction + FOR UPDATE SKIP LOCKED)
      const result = await startMatching(userId);

      if (result.status === 'matched' && result.match) {
        handleMatchFound(result.match);
        return;
      }

      // 3️⃣ فحص فوري بعد الدخول لقائمة الانتظار + فحص دوري كشبكة أمان
      await checkExistingMatch();
     if ((phaseRef.current as string) === 'waiting') {
        pollTimer.current = setInterval(checkExistingMatch, POLL_INTERVAL_MS);
      }
    } catch {
      stopSearchResources();
      // لا نترك صف انتظار معلقاً لو الـ RPC نجحت ثم فشل شيء آخر
      cancelMatching(userId).catch(() => {});
      setPhaseSafe('error');
    } finally {
      startingRef.current = false;
    }
  };

  // ── Cancel while waiting ─────────────────────────────────────
  const handleCancel = async () => {
    // لو المطابقة تمت بالفعل في نفس لحظة الضغط، لا نلغي — الاحتفال جارٍ
    if (matchedRef.current) return;

    stopSearchResources();
    await cancelMatching(userId);

    // 🛡️ سباق الإلغاء: قد يكون شريك قد طابقنا في اللحظة نفسها قبل حذف
    // صف الانتظار. لو وُجدت مباراة نشطة حديثة، ننهيها ونرسل إشارة end
    // حتى لا يبقى الطرف الآخر معلقاً في مكالمة فارغة.
    const cutoff = new Date(Date.now() - RECENT_MATCH_WINDOW_MS).toISOString();
    const { data: strayMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('status', 'active')
      .or(`user1.eq.${userId},user2.eq.${userId}`)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (strayMatch && !matchedRef.current) {
      await supabase.from('matches').update({ status: 'ended' }).eq('id', strayMatch.id);
      await supabase.from('signals').insert({ match_id: strayMatch.id, type: 'end', data: {}, sender: userId });
    }

    setPhaseSafe('idle');
  };

  // 🧹 تنظيف عند إغلاق الشاشة فقط (وليس عند كل تغيير مرحلة كما كان سابقاً)
  useEffect(() => {
    return () => {
      if (matchTimer.current) clearTimeout(matchTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (phaseRef.current === 'waiting') {
        cancelMatching(userIdRef.current).catch(() => {});
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={s.overlay}
    >
      <style>{CSS}</style>

      {(phase === 'idle' || phase === 'error') && (
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
          {phase === 'error'   && '⚠️'}
        </motion.div>
      </AnimatePresence>

      <h2 style={s.title}>
        {phase === 'idle'    && 'مطابقة عشوائية'}
        {phase === 'waiting' && `جاري البحث${dots}`}
        {phase === 'matched' && 'تم العثور على شريك!'}
        {phase === 'error'   && 'حدث خطأ في الاتصال'}
      </h2>

      <p style={s.sub}>
        {phase === 'idle'    && 'اضغط ابدأ وهنوصّلك بشخص عشوائي على فيديو كول فوراً'}
        {phase === 'waiting' && 'بندور على شخص ليك… استنى لحظة'}
        {phase === 'matched' && 'بيتم الاتصال الآن… استعد!'}
        {phase === 'error'   && 'تعذر بدء البحث. تأكد من اتصالك بالإنترنت وحاول مرة أخرى'}
      </p>

      {/* أزرار التحكم */}
      {(phase === 'idle' || phase === 'error') && (
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          style={s.btnPrimary} onClick={handleStart}
        >
          {phase === 'error' ? 'إعادة المحاولة' : 'ابدأ المطابقة الآن'}
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
